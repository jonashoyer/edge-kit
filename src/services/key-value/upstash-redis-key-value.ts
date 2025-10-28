import { Redis } from "@upstash/redis";

import type { Nullable } from "../../utils/type-utils";
import { AbstractKeyValueService } from "./abstract-key-value";

export class UpstashRedisKeyValueService extends AbstractKeyValueService {
  private readonly client: Redis;

  constructor(redis: { url: string; token: string } | Redis) {
    super();
    this.client =
      "url" in redis
        ? new Redis({ url: redis.url, token: redis.token })
        : redis;
  }

  async get<T>(key: string): Promise<Nullable<T>> {
    const value = await this.client.get<T>(key);
    return value ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, { ex: ttlSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async increment(key: string, amount = 1): Promise<number> {
    return await this.client.incrby(key, amount);
  }

  async decrement(key: string, amount = 1): Promise<number> {
    return await this.client.decrby(key, amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async mget<T>(keys: string[]): Promise<Nullable<T>[]> {
    return await this.client.mget<Nullable<T>[]>(...keys);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, { score, member });
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const rank = await this.client.zrank(key, member);
    return rank === null ? null : rank;
  }

  async zcard(key: string): Promise<number> {
    return await this.client.zcard(key);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zrange(key, start, stop);
  }

  async mdelete(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async zrem(key: string, member: string | string[]): Promise<void> {
    if (Array.isArray(member)) {
      if (member.length > 0) {
        await this.client.zrem(key, ...member);
      }
    } else {
      await this.client.zrem(key, member);
    }
  }
}
