import type { EncryptionService } from "../../secret/encryption-service";

export interface EnvInjectorConfig {
  encryption: EncryptionService;
}

export type EnvVars = Record<string, string>;

/**
 * Handles decryption and formatting of env payloads without persistence.
 */
export class EnvInjector {
  private encryption: EncryptionService;

  constructor(config: EnvInjectorConfig) {
    this.encryption = config.encryption;
  }

  /**
   * Decrypt an encrypted payload into env vars.
   * Payload is expected to be a JSON string of key/value pairs.
   */
  async decryptPayload(payload: string): Promise<EnvVars> {
    const decrypted = await this.encryption.decryptStringified(payload);
    const parsed = JSON.parse(decrypted) as unknown;
    if (!isRecordOfStrings(parsed)) {
      throw new Error("Invalid env payload format");
    }
    return parsed;
  }

  /**
   * Convert env vars into .env file contents.
   */
  formatEnvFile(vars: EnvVars): string {
    const entries = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));
    const lines: string[] = [];
    for (const [key, value] of entries) {
      lines.push(`${key}=${escapeEnvValue(value)}`);
    }
    return lines.join("\n");
  }
}

const isRecordOfStrings = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entries = Object.entries(value);
  for (const [key, val] of entries) {
    if (!key || typeof val !== "string") {
      return false;
    }
  }
  return true;
};

const escapeEnvValue = (value: string): string => {
  if (!value) {
    return "\"\"";
  }
  const needsQuotes = /\s|\n|\r|"|'/u.test(value);
  if (!needsQuotes) {
    return value;
  }
  const escaped = value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, "\\\"")
    .replace(/\n/gu, "\\n")
    .replace(/\r/gu, "\\r");
  return `"${escaped}"`;
};
