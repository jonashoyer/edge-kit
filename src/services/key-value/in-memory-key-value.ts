import type { Nullable } from '../../utils/type-utils';
import { AbstractKeyValueService } from './abstract-key-value';

type StoredValue = {
  value: unknown;
  expiresAt: number | null;
};

/**
 * In-memory implementation of the key-value service.
 * Supports basic CRUD, counters, and TTLs for local usage or tests.
 * Sorted-set operations are not supported and will throw.
 *
 * @example
 * const kv = new InMemoryKeyValueService();
 * await kv.set("foo", "bar", 60);
 * const value = await kv.get<string>("foo");
 */
export class InMemoryKeyValueService extends AbstractKeyValueService {
  private readonly store = new Map<string, StoredValue>();

  private getEntry(key: string): StoredValue | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry;
  }

  async get<T>(key: string): Promise<Nullable<T>> {
    const entry = this.getEntry(key);
    return entry ? (entry.value as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt =
      ttlSeconds === undefined ? null : Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.getEntry(key) !== null;
  }

  async increment(key: string, amount = 1): Promise<number> {
    const entry = this.getEntry(key);
    const current = entry ? entry.value : 0;

    if (current !== 0 && typeof current !== 'number') {
      throw new Error(`Key ${key} is not a number`);
    }

    const next = (current as number) + amount;
    this.store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async decrement(key: string, amount = 1): Promise<number> {
    return await this.increment(key, -amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.getEntry(key);
    if (!entry) {
      return false;
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value: entry.value, expiresAt });
    return true;
  }

  async zadd(): Promise<void> {
    throw new Error('InMemoryKeyValueService does not support sorted sets');
  }

  async zrank(): Promise<number | null> {
    throw new Error('InMemoryKeyValueService does not support sorted sets');
  }

  async zcard(): Promise<number> {
    throw new Error('InMemoryKeyValueService does not support sorted sets');
  }

  async zrange(): Promise<string[]> {
    throw new Error('InMemoryKeyValueService does not support sorted sets');
  }

  async zrem(): Promise<void> {
    throw new Error('InMemoryKeyValueService does not support sorted sets');
  }

  async mget<T>(keys: string[]): Promise<Nullable<T>[]> {
    const results: Nullable<T>[] = [];
    for (const key of keys) {
      const entry = this.getEntry(key);
      results.push(entry ? (entry.value as T) : null);
    }
    return results;
  }

  async mset<T>(keyValues: [string, T][], ttlSeconds?: number): Promise<void> {
    const expiresAt =
      ttlSeconds === undefined ? null : Date.now() + ttlSeconds * 1000;

    for (const [key, value] of keyValues) {
      this.store.set(key, { value, expiresAt });
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
    }
  }
}
