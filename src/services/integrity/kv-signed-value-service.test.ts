import { beforeEach, describe, expect, it } from 'vitest';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { KvSignedValueService } from './kv-signed-value-service';

/**
 * Mock KV service for testing
 */
class MockKvService implements AbstractKeyValueService {
  private store: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) ?? null) as T | null;
  }

  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    return keys.map((k) => (this.store.get(k) ?? null) as T | null);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async increment(key: string, amount = 1): Promise<number> {
    const current = (this.store.get(key) as number) ?? 0;
    const updated = current + amount;
    this.store.set(key, updated);
    return updated;
  }

  async decrement(key: string, amount = 1): Promise<number> {
    const current = (this.store.get(key) as number) ?? 0;
    const updated = current - amount;
    this.store.set(key, updated);
    return updated;
  }

  async expire(): Promise<boolean> {
    return true;
  }

  async zadd(): Promise<void> {}
  async zrank(): Promise<number | null> {
    return null;
  }
  async zcard(): Promise<number> {
    return 0;
  }
  async zrange(): Promise<string[]> {
    return [];
  }
  async zrem(): Promise<void> {}
  async mdelete(): Promise<void> {}
}

describe('KvSignedValueService', () => {
  let kvService: MockKvService;
  let signedKvService: KvSignedValueService;
  const secret = 'test-secret';

  beforeEach(() => {
    kvService = new MockKvService();
    signedKvService = new KvSignedValueService(kvService);
  });

  describe('set and get', () => {
    it('should store and retrieve a string value', async () => {
      const key = 'admin-id';
      const value = 'admin-123';

      await signedKvService.set(key, value, secret);
      const retrieved = await signedKvService.get<string>(key, secret);

      expect(retrieved).toBe(value);
    });

    it('should store and retrieve an object value', async () => {
      const key = 'admin-config';
      const value = {
        id: 'admin-1',
        role: 'superuser',
        permissions: ['read', 'write'],
      };

      await signedKvService.set(key, value, secret);
      const retrieved = await signedKvService.get<typeof value>(key, secret);

      expect(retrieved).toEqual(value);
    });

    it('should store and retrieve an array value', async () => {
      const key = 'admin-ids';
      const value = ['admin-1', 'admin-2', 'admin-3'];

      await signedKvService.set(key, value, secret);
      const retrieved = await signedKvService.get<string[]>(key, secret);

      expect(retrieved).toEqual(value);
    });

    it('should use namespace for key isolation', async () => {
      const key = 'config';
      const value1 = 'production-value';
      const value2 = 'staging-value';

      await signedKvService.set(key, value1, secret, 'production');
      await signedKvService.set(key, value2, secret, 'staging');

      const retrieved1 = await signedKvService.get<string>(
        key,
        secret,
        'production'
      );
      const retrieved2 = await signedKvService.get<string>(
        key,
        secret,
        'staging'
      );

      expect(retrieved1).toBe(value1);
      expect(retrieved2).toBe(value2);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await signedKvService.get<string>(
        'nonexistent',
        secret
      );
      expect(retrieved).toBeNull();
    });

    it('should return null if signature verification fails', async () => {
      const key = 'test';
      const value = 'original-value';

      await signedKvService.set(key, value, secret);

      // Try to get with wrong secret
      const retrieved = await signedKvService.get<string>(key, 'wrong-secret');
      expect(retrieved).toBeNull();
    });

    it('should return null if value is tampered', async () => {
      const key = 'test';
      const value = { id: '123' };

      await signedKvService.set(key, value, secret);

      // Manually tamper with the stored signed value
      const signedValue = await kvService.get(`integrity:default:${key}`);
      if (
        signedValue &&
        typeof signedValue === 'object' &&
        'value' in signedValue
      ) {
        (signedValue as Record<string, unknown>).value = { id: 'tampered' };
      }

      // Try to retrieve
      const retrieved = await signedKvService.get<typeof value>(key, secret);
      expect(retrieved).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a signed value', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await signedKvService.set(key, value, secret);
      expect(await signedKvService.exists(key)).toBe(true);

      await signedKvService.delete(key);
      expect(await signedKvService.exists(key)).toBe(false);
    });

    it('should delete using namespace', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await signedKvService.set(key, value, secret, 'namespace1');
      await signedKvService.set(key, value, secret, 'namespace2');

      await signedKvService.delete(key, 'namespace1');

      expect(await signedKvService.exists(key, 'namespace1')).toBe(false);
      expect(await signedKvService.exists(key, 'namespace2')).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return true for existing signed value', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await signedKvService.set(key, value, secret);
      const exists = await signedKvService.exists(key);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await signedKvService.exists('nonexistent');
      expect(exists).toBe(false);
    });

    it('should respect namespace for exists check', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await signedKvService.set(key, value, secret, 'namespace1');

      expect(await signedKvService.exists(key, 'namespace1')).toBe(true);
      expect(await signedKvService.exists(key, 'namespace2')).toBe(false);
    });
  });

  describe('integration', () => {
    it('should handle multiple values with different secrets', async () => {
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';
      const value1 = { config: 'value1' };
      const value2 = { config: 'value2' };

      await signedKvService.set('key1', value1, secret1);
      await signedKvService.set('key2', value2, secret2);

      const retrieved1 = await signedKvService.get<typeof value1>(
        'key1',
        secret1
      );
      const retrieved2 = await signedKvService.get<typeof value2>(
        'key2',
        secret2
      );

      expect(retrieved1).toEqual(value1);
      expect(retrieved2).toEqual(value2);

      // Cross-check with wrong secret
      const crossCheck1 = await signedKvService.get<typeof value1>(
        'key1',
        secret2
      );
      expect(crossCheck1).toBeNull();
    });

    it('should maintain data integrity across multiple rewrites', async () => {
      const key = 'config';
      const values = ['v1', 'v2', 'v3'];

      for (const value of values) {
        await signedKvService.set(key, value, secret);
        const retrieved = await signedKvService.get<string>(key, secret);
        expect(retrieved).toBe(value);
      }
    });

    it('should handle complex nested objects', async () => {
      const value = {
        admins: [
          { id: '1', name: 'Alice', roles: ['read', 'write', 'delete'] },
          { id: '2', name: 'Bob', roles: ['read', 'write'] },
        ],
        config: {
          enabled: true,
          level: 5,
          metadata: { created: '2025-01-01' },
        },
      };

      await signedKvService.set('complex', value, secret);
      const retrieved = await signedKvService.get<typeof value>(
        'complex',
        secret
      );

      expect(retrieved).toEqual(value);
      expect(retrieved?.admins[0].roles).toContain('delete');
    });
  });
});
