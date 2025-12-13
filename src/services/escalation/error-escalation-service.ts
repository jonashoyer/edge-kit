import { serializeError } from "../../utils/error-utils";
import type {
  AbstractAlertingService,
  AlertSeverity,
} from "../alerting/abstract-alerting";
import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import type { AbstractLogger } from "../logging/abstract-logger";

export type AlwaysRule = {
  type: "always";
  intervalSeconds?: number;
};

export type ThresholdRule = {
  type: "threshold";
  count: number;
  windowSeconds: number;
};

export type EscalationRule = AlwaysRule | ThresholdRule;

export type CaptureConfig = {
  name: string;
  severity: AlertSeverity;
  message?: string;
  groupId?: string;
  rules: EscalationRule[];
};

export type ErrorMetadata = {
  name?: string;
  message?: string;
  stack?: string;
};

const DEFAULT_PREFIX = "err:";

const SAFE_CHARS = /[^a-zA-Z0-9:_\-.]/g;
const sanitize = (str: string) => str.replace(SAFE_CHARS, "_");

function ruleKey({
  prefix,
  name,
  ruleIndex,
  groupId,
  type,
}: {
  prefix: string;
  name: string;
  ruleIndex: number;
  type: "always" | "threshold";
  groupId?: string;
}): string {
  const safeGroup = groupId ? sanitize(groupId) : null;
  return [prefix, name, safeGroup, type, ruleIndex].filter(Boolean).join(":");
}

export class ErrorEscalationService {
  private readonly kv: AbstractKeyValueService;
  private readonly alerting: AbstractAlertingService;
  private readonly logger?: AbstractLogger;
  private readonly prefix: string;

  constructor(
    kv: AbstractKeyValueService,
    alerting: AbstractAlertingService,
    logger?: AbstractLogger,
    options?: { prefix?: string }
  ) {
    this.kv = kv;
    this.alerting = alerting;
    this.logger = logger;
    this.prefix = options?.prefix ?? DEFAULT_PREFIX;
  }

  async capture(error: unknown, config: CaptureConfig): Promise<boolean> {
    const { name, severity, groupId, rules } = config;
    const meta = this.toMeta(error);
    return await this.applyRules({
      name,
      severity,
      groupId,
      rules,
      meta,
      config,
    });
  }

  private toMeta(error: unknown): ErrorMetadata {
    const se = serializeError(error);
    return { name: se.name, message: se.message, stack: se.stack };
  }

  private async applyRules(args: {
    name: string;
    severity: AlertSeverity;
    groupId?: string;
    rules: EscalationRule[];
    meta: ErrorMetadata;
    config: CaptureConfig;
  }): Promise<boolean> {
    const { name, severity, groupId, rules, meta, config } = args;

    const conditions = await Promise.all(
      rules.map(async (rule, idx) => {
        switch (rule.type) {
          case "always": {
            const condition = await this.handleAlways({
              name,
              groupId,
              rule,
              ruleIndex: idx,
            });
            return condition ? rule : null;
          }
          case "threshold": {
            const condition = await this.handleThreshold({
              name,
              groupId,
              rule,
              ruleIndex: idx,
            });
            return condition ? rule : null;
          }
          default:
            return null;
        }
      })
    );

    const triggeredRules = conditions.filter(
      (c): c is EscalationRule => c !== null
    );

    if (triggeredRules.length === 0) {
      return false;
    }

    try {
      await this.notify({
        name,
        severity,
        groupId,
        rules: triggeredRules,
        meta,
        config,
      });
    } catch (e) {
      this.logger?.error("Error escalation capture rule failure", {
        name,
        groupId,
        error: (e as Error)?.message ?? String(e),
      });
    }
    return true;
  }

  private async handleThreshold(args: {
    name: string;
    groupId?: string;
    rule: ThresholdRule;
    ruleIndex: number;
  }): Promise<boolean> {
    const { name, groupId, rule, ruleIndex } = args;
    const k = ruleKey({
      prefix: this.prefix,
      name,
      ruleIndex,
      groupId,
      type: "threshold",
    });
    const count = await this.kv.increment(k, 1);
    await this.kv.expire(k, rule.windowSeconds);
    return count === rule.count;
  }

  private async handleAlways(args: {
    name: string;
    groupId?: string;
    rule: AlwaysRule;
    ruleIndex: number;
  }) {
    const { name, groupId, rule, ruleIndex } = args;
    if (!rule.intervalSeconds) {
      return true;
    }
    const ck = ruleKey({
      prefix: this.prefix,
      name,
      ruleIndex,
      groupId,
      type: "always",
    });
    const exists = await this.kv.exists(ck);
    if (!exists) {
      await this.kv.set(ck, 1, rule.intervalSeconds);
      return true;
    }
    return false;
  }

  private buildRuleLine(rule: EscalationRule): string {
    switch (rule.type) {
      case "always":
        return `rule=always interval=${rule.intervalSeconds}s`;
      case "threshold":
        return `rule=threshold count=${rule.count} window=${rule.windowSeconds}s`;
      default:
        return "";
    }
  }

  private buildText(opts: {
    name: string;
    message?: string;
    groupId: string | undefined;
    rules: EscalationRule[];
    meta: ErrorMetadata;
  }): string {
    const { name, message, groupId, rules, meta } = opts;

    const header = `Error Escalation: ${name}`;
    const group = groupId ? `\nGroup: ${groupId}` : "";
    const ruleLines = rules.map(this.buildRuleLine).join("\n");

    const errMsg = meta.message ? `\nError: ${meta.message}` : "";
    const errName = meta.name ? ` (${meta.name})` : "";
    const stack = meta.stack ? `\n\nStack:\n${truncateStack(meta.stack)}` : "";

    return `${header}${errName}${group}\n${message}\n${ruleLines}${errMsg}${stack}`;
  }

  private async notify(opts: {
    name: string;
    severity: AlertSeverity;
    groupId: string | undefined;
    rules: EscalationRule[];
    meta: ErrorMetadata;
    config: CaptureConfig;
    extra?: { count?: number };
  }): Promise<void> {
    await this.alerting.alert(this.buildText(opts), {
      severity: opts.severity,
      source: "error-escalation",
    });
  }
}

function truncateStack(stack: string, maxLines = 30): string {
  const lines = stack.split("\n");
  if (lines.length <= maxLines) return stack;
  const head = lines.slice(0, maxLines).join("\n");
  return `${head}\n... (${lines.length - maxLines} more lines)`;
}
