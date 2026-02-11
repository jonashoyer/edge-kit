import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import type { WorkspaceRecord, WorkspaceStatus } from "./types";
import type { WorkspaceStore } from "./workspace-store";

export interface KeyValueWorkspaceStoreConfig {
  kv: AbstractKeyValueService;
  prefix?: string;
}

export class KeyValueWorkspaceStore implements WorkspaceStore {
  private readonly kv: AbstractKeyValueService;
  private readonly prefix: string;

  constructor(config: KeyValueWorkspaceStoreConfig) {
    this.kv = config.kv;
    this.prefix = config.prefix ?? "cac:workspace:";
  }

  async get(id: string): Promise<WorkspaceRecord | null> {
    return await this.kv.get<WorkspaceRecord>(this.key(id));
  }

  async save(record: WorkspaceRecord): Promise<void> {
    await this.kv.set(this.key(record.id), record);
  }

  async update(record: WorkspaceRecord): Promise<void> {
    await this.kv.set(this.key(record.id), record);
  }

  async updateStatus(id: string, status: WorkspaceStatus): Promise<void> {
    const existing = await this.get(id);
    if (!existing) {
      return;
    }
    await this.update({ ...existing, status, lastUsedAt: new Date().toISOString() });
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(this.key(id));
  }

  private key(id: string): string {
    return `${this.prefix}${id}`;
  }
}
