import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import { hashCodeB64 } from "../../utils/crypto-utils";
import type { AgentBoxStore, AgentBoxQuery } from "./_slop/agent-box-store";
import type { AgentBox, AgentBoxStatus, IsoTimestamp } from "./types";

export interface KeyValueAgentBoxStoreConfig {
  kv: AbstractKeyValueService;
  keyPrefix?: string;
  scanLimit?: number;
}

/**
 * Redis-backed AgentBox store using a KV abstraction.
 */
export class KeyValueAgentBoxStore implements AgentBoxStore {
  private kv: AbstractKeyValueService;
  private keyPrefix: string;
  private scanLimit: number;

  constructor(config: KeyValueAgentBoxStoreConfig) {
    this.kv = config.kv;
    this.keyPrefix = config.keyPrefix ?? "cac";
    this.scanLimit = config.scanLimit ?? 100;
  }

  async getById(id: string): Promise<AgentBox | null> {
    return await this.kv.get<AgentBox>(this.boxKey(id));
  }

  async findAvailable(query: AgentBoxQuery): Promise<AgentBox | null> {
    const ids = await this.kv.zrange(this.repoIndexKey(query), 0, this.scanLimit);
    if (ids.length === 0) {
      return null;
    }

    const boxes = await this.fetchBoxes(ids);
    let expiredBusy: AgentBox | null = null;
    for (const box of boxes) {
      if (!box) {
        continue;
      }
      const leaseValid = isLeaseValid(box.leaseExpiresAt);
      if (box.status === "ready" && !leaseValid) {
        return box;
      }
      if (box.status === "busy" && !leaseValid) {
        expiredBusy = box;
        break;
      }
    }
    if (expiredBusy) {
      return await this.reclaimExpiredLease(expiredBusy);
    }
    return null;
  }

  async listByRepo(query: AgentBoxQuery): Promise<AgentBox[]> {
    const ids = await this.kv.zrange(this.repoIndexKey(query), 0, this.scanLimit);
    const boxes = await this.fetchBoxes(ids);
    return boxes.filter((box): box is AgentBox => Boolean(box));
  }

  async save(box: AgentBox): Promise<void> {
    const score = timestampScore(box.meta.lastUsed ?? box.meta.createdAt);
    await this.kv.set(this.boxKey(box.id), box);
    await this.kv.zadd(
      this.repoIndexKey({
        repoUrl: box.repoContext.url,
        branch: box.repoContext.branch,
      }),
      score,
      box.id
    );
    await this.kv.zadd(this.statusIndexKey(box.status), score, box.id);
  }

  async updateStatus(id: string, status: AgentBoxStatus): Promise<void> {
    const box = await this.getById(id);
    if (!box) {
      return;
    }
    if (box.status !== status) {
      await this.kv.zrem(this.statusIndexKey(box.status), id);
    }
    const updated: AgentBox = {
      ...box,
      status,
    };
    await this.save(updated);
  }

  async lease(
    id: string,
    assignedTo: string,
    ttlSeconds: number
  ): Promise<boolean> {
    const box = await this.getById(id);
    if (!box) {
      return false;
    }
    if (isLeaseValid(box.leaseExpiresAt)) {
      return false;
    }
    if (box.status !== "ready" && box.status !== "busy") {
      return false;
    }
    const leaseExpiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const updated: AgentBox = {
      ...box,
      assignedTo,
      leaseExpiresAt,
      status: "busy",
      meta: {
        ...box.meta,
        lastUsed: new Date().toISOString(),
      },
    };
    await this.save(updated);
    return true;
  }

  async release(id: string): Promise<void> {
    const box = await this.getById(id);
    if (!box) {
      return;
    }
    const updated: AgentBox = {
      ...box,
      assignedTo: undefined,
      leaseExpiresAt: undefined,
      status: "ready",
      meta: {
        ...box.meta,
        lastUsed: new Date().toISOString(),
      },
    };
    await this.save(updated);
  }

  private async fetchBoxes(ids: string[]): Promise<(AgentBox | null)[]> {
    if (ids.length === 0) {
      return [];
    }
    const keys = ids.map((id) => this.boxKey(id));
    return await this.kv.mget<AgentBox>(keys);
  }

  private boxKey(id: string): string {
    return `${this.keyPrefix}:box:${id}`;
  }

  private repoIndexKey(query: AgentBoxQuery): string {
    const repoHash = hashCodeB64(query.repoUrl);
    return `${this.keyPrefix}:repo:${repoHash}:${query.branch}`;
  }

  private statusIndexKey(status: AgentBoxStatus): string {
    return `${this.keyPrefix}:status:${status}`;
  }

  private async reclaimExpiredLease(box: AgentBox): Promise<AgentBox | null> {
    const refreshed = await this.getById(box.id);
    if (!refreshed) {
      return null;
    }
    if (isLeaseValid(refreshed.leaseExpiresAt)) {
      return null;
    }
    if (refreshed.status !== "ready") {
      await this.updateStatus(refreshed.id, "ready");
    }
    await this.release(refreshed.id);
    return await this.getById(refreshed.id);
  }
}

const isLeaseValid = (leaseExpiresAt?: IsoTimestamp): boolean => {
  if (!leaseExpiresAt) {
    return false;
  }
  const expiresAtMs = Date.parse(leaseExpiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }
  return expiresAtMs > Date.now();
};

const timestampScore = (timestamp: IsoTimestamp): number => {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) {
    return Date.now();
  }
  return ms;
};
