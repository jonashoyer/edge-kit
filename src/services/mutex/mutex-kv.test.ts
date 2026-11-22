import { describe, expect, it, vi } from 'vitest';
import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import { MutexAcquireTimeoutError } from './abstract-mutex';
import { getOrSetWithLock } from './locked-cache';
import { KvMutex } from './mutex-kv';

describe('KvMutex', () => {
  it('acquires, refreshes, and releases locks with token ownership checks', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex(kv, { retries: 0, ttlSeconds: 30 });

    const { token } = await mutex.acquire('job:1');
    expect(await mutex.refresh('job:1', 'wrong-token')).toBe(false);
    expect(await mutex.refresh('job:1', token)).toBe(true);
    expect(await mutex.release('job:1', 'wrong-token')).toBe(false);
    expect(await mutex.release('job:1', token)).toBe(true);
    expect(await mutex.release('job:1', token)).toBe(false);
  });

  it('throws MutexAcquireTimeoutError when lock remains held past retries', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex(kv, {
      backoff: 'none',
      jitterMs: 1,
      retries: 1,
      retryDelayMs: 5,
    });

    const { token } = await mutex.acquire('busy');
    await expect(mutex.acquire('busy')).rejects.toBeInstanceOf(
      MutexAcquireTimeoutError
    );
    await mutex.release('busy', token);
  });
});

describe('getOrSetWithLock', () => {
  it('returns cached values on the fast path without acquiring a lock', async () => {
    const kv = new InMemoryKeyValueService();
    await kv.set('item:1', { value: 'cached' }, 60);

    const mutex = new KvMutex(kv);
    const acquireSpy = vi.spyOn(mutex, 'acquire');
    const compute = vi.fn(async () => ({ value: 'fresh' }));

    const result = await getOrSetWithLock(kv, 'item:1', compute, { mutex });

    expect(result).toEqual({ value: 'cached' });
    expect(compute).not.toHaveBeenCalled();
    expect(acquireSpy).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent cold-start computes via double-checked locking', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex(kv, {
      backoff: 'none',
      jitterMs: 5,
      retries: 20,
      retryDelayMs: 10,
    });
    const compute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { token: 'minted-1' };
    });

    const [first, second] = await Promise.all([
      getOrSetWithLock(kv, 'token:bucket', compute, { mutex, ttlSeconds: 60 }),
      getOrSetWithLock(kv, 'token:bucket', compute, { mutex, ttlSeconds: 60 }),
    ]);

    expect(first).toEqual({ token: 'minted-1' });
    expect(second).toEqual({ token: 'minted-1' });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes stale values once when isFresh returns false and supports dynamic TTL', async () => {
    const kv = new InMemoryKeyValueService();
    const setSpy = vi.spyOn(kv, 'set');
    const mutex = new KvMutex(kv, {
      backoff: 'none',
      jitterMs: 5,
      retries: 20,
      retryDelayMs: 10,
    });
    const now = 100_000;

    await kv.set('token:bucket', { expiresAt: now + 1000, token: 'stale' }, 60);
    setSpy.mockClear();

    const compute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { expiresAt: now + 600_000, token: 'refreshed' };
    });

    const options = {
      isFresh: (entry: { expiresAt: number; token: string }) =>
        entry.expiresAt - 60_000 > now,
      mutex,
      ttlSeconds: (entry: { expiresAt: number; token: string }) =>
        Math.max(1, Math.floor((entry.expiresAt - now) / 1000)),
    };

    const [first, second] = await Promise.all([
      getOrSetWithLock(kv, 'token:bucket', compute, options),
      getOrSetWithLock(kv, 'token:bucket', compute, options),
    ]);

    expect(first.token).toBe('refreshed');
    expect(second.token).toBe('refreshed');
    expect(compute).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      'token:bucket',
      { expiresAt: now + 600_000, token: 'refreshed' },
      600
    );
  });

  it('bypasses cache when bypassCache is true and releases the lock on compute errors', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex(kv, { retries: 0 });
    await kv.set('item:2', 'old', 60);

    await expect(
      getOrSetWithLock(
        kv,
        'item:2',
        async () => {
          throw new Error('compute failed');
        },
        { bypassCache: true, mutex }
      )
    ).rejects.toThrow('compute failed');

    const refreshed = await getOrSetWithLock(
      kv,
      'item:2',
      async () => 'updated',
      { bypassCache: true, mutex, ttlSeconds: 60 }
    );

    expect(refreshed).toBe('updated');
    expect(await kv.get<string>('item:2')).toBe('updated');
  });
});
