import IORedis, { RedisOptions } from 'ioredis';
import { AbstractKeyValueService } from './abstractKeyValue';
import { Nullable } from '../../utils/typeUtils';

export class IoredisKeyValueService extends AbstractKeyValueService {
  private client: IORedis;

  constructor(options: RedisOptions) {
    super();
    this.client = new IORedis(options);
  }

  async get<T>(key: string): Promise<Nullable<T>> {
    const value = await this.client.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds !== undefined) {
      await this.client.set(key, serializedValue, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serializedValue);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    return await this.client.incrby(key, amount);
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    return await this.client.decrby(key, amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async mget<T>(keys: string[]): Promise<Nullable<T>[]> {
    const values = await this.client.mget(keys);
    return values.map(value => {
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    });
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
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

  async zrem(key: string, member: string | string[]): Promise<void> {
    if (Array.isArray(member)) {
      if (member.length > 0) {
        await this.client.zrem(key, ...member);
      }
    } else {
      await this.client.zrem(key, member);
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
