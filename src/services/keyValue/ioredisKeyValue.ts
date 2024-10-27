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
}
