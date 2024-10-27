import { Nullable } from '../../utils/typeUtils';

export abstract class AbstractKeyValueService {
  abstract get<T>(key: string): Promise<Nullable<T>>;
  abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract increment(key: string, amount?: number): Promise<number>;
  abstract decrement(key: string, amount?: number): Promise<number>;
  abstract expire(key: string, ttlSeconds: number): Promise<boolean>;
}
