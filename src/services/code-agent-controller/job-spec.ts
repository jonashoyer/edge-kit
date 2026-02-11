import type { JobSpec } from "./types";

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export function parseJobSpec(payload: unknown): JobSpec {
  if (!isRecord(payload)) {
    throw new Error("Invalid job spec payload");
  }
  const runtime = payload["runtime"];
  if (!isRecord(runtime)) {
    throw new Error("Job spec missing runtime");
  }
  const node = runtime["node"];
  if (typeof node !== "string" || node.trim().length === 0) {
    throw new Error("Job spec missing runtime.node");
  }
  const pnpm = runtime["pnpm"];
  if (pnpm !== undefined && typeof pnpm !== "string") {
    throw new Error("runtime.pnpm must be a string");
  }
  const env = normalizeEnv(payload["env"]);
  const setupCommands = normalizeSetupCommands(payload["setupCommands"]);
  return {
    runtime: {
      node: node.trim(),
      ...(pnpm ? { pnpm: pnpm.trim() } : {}),
    },
    ...(env ? { env } : {}),
    ...(setupCommands ? { setupCommands } : {}),
  };
}

export function parseJobSpecJson(json: string): JobSpec {
  let payload: unknown;
  try {
    payload = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Invalid JSON for job spec");
  }
  return parseJobSpec(payload);
}

export function mergeEnv(
  base: Record<string, string> | undefined,
  overlay: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!base && !overlay) {
    return undefined;
  }
  return {
    ...(base ?? {}),
    ...(overlay ?? {}),
  };
}

function normalizeEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("env must be an object");
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!ENV_KEY_REGEX.test(key)) {
      throw new Error(`Invalid env key: ${key}`);
    }
    if (typeof entry !== "string") {
      throw new Error(`Invalid env value for ${key}`);
    }
    result[key] = entry;
  }
  return result;
}

function normalizeSetupCommands(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("setupCommands must be an array");
  }
  const commands: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error("setupCommands entries must be non-empty strings");
    }
    commands.push(entry.trim());
  }
  return commands.length > 0 ? commands : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
