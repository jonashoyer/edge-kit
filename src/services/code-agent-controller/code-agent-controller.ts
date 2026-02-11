import type { Provisioner } from "./provisioner";
import type { JobSpec, WorkspaceMode, WorkspaceRecord } from "./types";
import type { WorkspaceStore } from "./workspace-store";
import {
  buildExecuteScript,
  buildProvisionScript,
  buildTeardownScript,
} from "./script-builder";
import { parseJobSpec, parseJobSpecJson } from "./job-spec";
import {
  CacExecutionError,
  CacNotFoundError,
  CacProvisioningError,
} from "./errors";

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export interface CodeAgentControllerConfig {
  store: WorkspaceStore;
  provisioner: Provisioner;
  workspaceRoot?: string;
  hostId: string;
  defaultJobSpec?: JobSpec;
}

/**
 * Orchestrates workspace lifecycle on a single host VM via RunCommand.
 */
export class CodeAgentController {
  private readonly store: WorkspaceStore;
  private readonly provisioner: Provisioner;
  private readonly workspaceRoot: string;
  private readonly hostId: string;
  private readonly defaultJobSpec: JobSpec;

  constructor(config: CodeAgentControllerConfig) {
    this.store = config.store;
    this.provisioner = config.provisioner;
    this.workspaceRoot = config.workspaceRoot ?? "/workspaces";
    this.hostId = config.hostId;
    this.defaultJobSpec = config.defaultJobSpec ?? {
      runtime: {
        node: "24.13.0",
      },
    };
  }

  async provisionWorkspace(params: {
    jobId: string;
    repoUrl?: string;
    branch?: string;
    configOverride?: JobSpec | string;
    envPayload?: Record<string, string>;
    allowEmptyWorkspace?: boolean;
  }): Promise<WorkspaceRecord> {
    await this.provisioner.ensureHostReady(this.hostId);
    const specOverride = parseOptionalOverride(params.configOverride);
    validateEnvPayload(params.envPayload);
    const mode = getWorkspaceMode(params.repoUrl);
    if (!params.repoUrl && !params.allowEmptyWorkspace) {
      throw new Error("repoUrl is required unless allowEmptyWorkspace is true");
    }
    if (params.repoUrl && !params.branch) {
      throw new Error("branch is required when repoUrl is provided");
    }
    const configToWrite =
      mode === "empty" ? specOverride ?? this.defaultJobSpec : specOverride;
    const script = buildProvisionScript({
      jobId: params.jobId,
      repoUrl: params.repoUrl,
      branch: params.branch,
      workspaceRoot: this.workspaceRoot,
      configOverride: configToWrite,
      envPayload: params.envPayload,
      allowEmptyWorkspace: params.allowEmptyWorkspace,
    });
    const result = await this.provisioner.runCommand(this.hostId, script);
    if (result.exitCode !== 0) {
      throw new CacProvisioningError(result.stderr || result.stdout);
    }
    const now = new Date().toISOString();
    const record: WorkspaceRecord = {
      id: params.jobId,
      repoUrl: params.repoUrl ?? "",
      branch: params.branch ?? "",
      status: "ready",
      createdAt: now,
      lastUsedAt: now,
      hostId: this.hostId,
      path: `${this.workspaceRoot}/${params.jobId}`,
      envInjected: Boolean(params.envPayload),
      mode,
    };
    await this.store.save(record);
    return record;
  }

  async executeCommand(params: {
    jobId: string;
    command: string;
  }): Promise<WorkspaceRecord> {
    const record = await this.store.get(params.jobId);
    if (!record) {
      throw new CacNotFoundError(`Workspace ${params.jobId} not found`);
    }
    const script = buildExecuteScript({
      workspaceRoot: this.workspaceRoot,
      jobId: params.jobId,
      command: params.command,
    });
    const result = await this.provisioner.runCommand(this.hostId, script);
    if (result.exitCode !== 0) {
      throw new CacExecutionError(result.stderr || result.stdout);
    }
    const updated: WorkspaceRecord = {
      ...record,
      status: "busy",
      lastUsedAt: new Date().toISOString(),
    };
    await this.store.update(updated);
    return updated;
  }

  async teardownWorkspace(jobId: string): Promise<void> {
    const record = await this.store.get(jobId);
    if (!record) {
      throw new CacNotFoundError(`Workspace ${jobId} not found`);
    }
    const script = buildTeardownScript({
      workspaceRoot: this.workspaceRoot,
      jobId,
    });
    const result = await this.provisioner.runCommand(this.hostId, script);
    if (result.exitCode !== 0) {
      throw new CacExecutionError(result.stderr || result.stdout);
    }
    await this.store.delete(jobId);
  }
}

function parseOptionalOverride(
  override: JobSpec | string | undefined
): JobSpec | undefined {
  if (!override) {
    return undefined;
  }
  if (typeof override === "string") {
    return parseJobSpecJson(override);
  }
  return parseJobSpec(override);
}

function validateEnvPayload(envPayload: Record<string, string> | undefined): void {
  if (!envPayload) {
    return;
  }
  for (const [key, value] of Object.entries(envPayload)) {
    if (!ENV_KEY_REGEX.test(key)) {
      throw new Error(`Invalid env payload key: ${key}`);
    }
    if (typeof value !== "string") {
      throw new Error(`Invalid env payload value for ${key}`);
    }
  }
}

function getWorkspaceMode(repoUrl: string | undefined): WorkspaceMode {
  return repoUrl ? "repo" : "empty";
}
