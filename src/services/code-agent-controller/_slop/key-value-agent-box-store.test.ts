import { describe, expect, it } from "vitest";

import { AbstractKeyValueService } from "../../key-value/abstract-key-value";
import { RedisAgentBoxStore } from "./redis-agent-box-store";
import type { AgentBox } from "../types";

class InMemoryKeyValueService extends AbstractKeyValueService {
  private store = new Map<string, unknown>();
  private zsets = new Map<string, Map<string, number>>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value as unknown);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async increment(key: string, amount = 1): Promise<number> {
    const current = (this.store.get(key) as number | undefined) ?? 0;
    const next = current + amount;
    this.store.set(key, next);
    return next;
  }

  async decrement(key: string, amount = 1): Promise<number> {
    return await this.increment(key, -amount);
  }

  async expire(_key: string, _ttlSeconds: number): Promise<boolean> {
    return true;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    zset.set(member, score);
    this.zsets.set(key, zset);
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const zset = this.zsets.get(key);
    if (!zset) {
      return null;
    }
    const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]?.[0] === member) {
        return i;
      }
    }
    return null;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const zset = this.zsets.get(key);
    if (!zset) {
      return [];
    }
    const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1]);
    const slice = sorted.slice(start, stop + 1);
    const members: string[] = [];
    for (const [member] of slice) {
      members.push(member);
    }
    return members;
  }

  async zrem(key: string, member: string | string[]): Promise<void> {
    const zset = this.zsets.get(key);
    if (!zset) {
      return;
    }
    if (Array.isArray(member)) {
      for (const item of member) {
        zset.delete(item);
      }
      return;
    }
    zset.delete(member);
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const values: (T | null)[] = [];
    for (const key of keys) {
      values.push(((this.store.get(key) as T | undefined) ?? null) as T | null);
    }
    return values;
  }

  async mset<T>(keyValues: [string, T][]): Promise<void> {
    for (const [key, value] of keyValues) {
      this.store.set(key, value as unknown);
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
    }
  }
}

describe("RedisAgentBoxStore", () => {
  it("leases a ready box and blocks re-lease until expiry", async () => {
    const kv = new InMemoryKeyValueService();
    const store = new RedisAgentBoxStore({ kv });
    const now = new Date().toISOString();

    const box: AgentBox = {
      id: "box-1",
      status: "ready",
      repoContext: { url: "repo", branch: "main" },
      network: { publicIp: "1.2.3.4", sshPort: 22 },
      meta: { createdAt: now, lastHeartbeat: now, isPoolInstance: true },
    };

    await store.save(box);

    const leased = await store.lease("box-1", "agent-1", 10);
    expect(leased).toBe(true);

    const available = await store.findAvailable({ repoUrl: "repo", branch: "main" });
    expect(available).toBeNull();

    const updated = await store.getById("box-1");
    expect(updated?.status).toBe("busy");
  });

  it("returns available box when lease expires", async () => {
    const kv = new InMemoryKeyValueService();
    const store = new RedisAgentBoxStore({ kv });
    const now = new Date().toISOString();
    const expired = new Date(Date.now() - 1000).toISOString();

    const box: AgentBox = {
      id: "box-2",
      status: "ready",
      assignedTo: "agent-2",
      leaseExpiresAt: expired,
      repoContext: { url: "repo", branch: "main" },
      network: { publicIp: "1.2.3.4", sshPort: 22 },
      meta: { createdAt: now, lastHeartbeat: now, isPoolInstance: true },
    };

    await store.save(box);

    const available = await store.findAvailable({ repoUrl: "repo", branch: "main" });
    expect(available?.id).toBe("box-2");
  });
});
