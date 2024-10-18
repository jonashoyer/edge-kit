import { Redis } from '@upstash/redis';
import { AbstractKeyValueService } from './abstractKeyValueService';
import { Nullable } from '../../utils/typeUtils';

export class UpstashRedisKeyValueService extends AbstractKeyValueService {
  private client: Redis;

  constructor(url: string, token: string) {
    super();
    this.client = new Redis({ url, token });
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
}
