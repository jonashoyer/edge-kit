import type { Nullable } from "../../utils/type-utils";

/**
 * Abstract base class for Key-Value storage services.
 * Defines standard methods for getting, setting, deleting, and managing expiry of keys.
 * Also supports sorted sets (zadd, zrange, etc.) and batch operations (mget, mset).
 */
export abstract class AbstractKeyValueService {
  abstract get<T>(key: string): Promise<Nullable<T>>;
  abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  abstract delete(key: string): Promise<void>;

  abstract exists(key: string): Promise<boolean>;
  abstract increment(key: string, amount?: number): Promise<number>;
  abstract decrement(key: string, amount?: number): Promise<number>;
  abstract expire(key: string, ttlSeconds: number): Promise<boolean>;

  abstract zadd(key: string, score: number, member: string): Promise<void>;
  abstract zrank(key: string, member: string): Promise<number | null>;
  abstract zcard(key: string): Promise<number>;
  abstract zrange(key: string, start: number, stop: number): Promise<string[]>;
  abstract zrem(key: string, member: string | string[]): Promise<void>;

  abstract mget<T>(keys: string[]): Promise<Nullable<T>[]>;
  abstract mset<T>(
    keyValues: [string, T][],
    ttlSeconds?: number
  ): Promise<void>;
  abstract mdelete(keys: string[]): Promise<void>;

  async withCache<T>(key: string, callback: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached as T;
    }

    const value = await callback();
    if (value) {
      await this.set(key, value);
    }
    return value;
  }
}
