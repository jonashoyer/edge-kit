import { describe, expect, it, vi } from 'vitest';
import type { Nullable } from '../../utils/type-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { AbstractStorage } from '../storage/abstract-storage';
import { KvFileLogger } from './kv-file-logger';

class InMemoryKeyValueService implements AbstractKeyValueService {
  readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<Nullable<T>> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async mget<T>(keys: string[]): Promise<Nullable<T>[]> {
    return keys.map((key) => (this.store.get(key) as T | undefined) ?? null);
  }

  async set<T>(key: string, value: T, _ttlSeconds?: number): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async increment(key: string, amount = 1): Promise<number> {
    let currentNumber = 0;
    const current = this.store.get(key);
    if (typeof current === 'number') {
      currentNumber = current;
    } else if (typeof current === 'string') {
      currentNumber = Number(current);
    }
    const next = Number.isFinite(currentNumber)
      ? currentNumber + amount
      : amount;
    this.store.set(key, next);
    return next;
  }

  async decrement(key: string, amount = 1): Promise<number> {
    return await this.increment(key, -amount);
  }

  async expire(key: string, _ttlSeconds: number): Promise<boolean> {
    return this.store.has(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const current = this.store.get(key);
    const map = current instanceof Map ? current : new Map<string, number>();
    map.set(member, score);
    this.store.set(key, map);
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const current = this.store.get(key);
    if (!(current instanceof Map)) {
      return null;
    }
    const sorted = [...current.entries()].sort((a, b) => a[1] - b[1]);
    const index = sorted.findIndex(([name]) => name === member);
    return index >= 0 ? index : null;
  }

  async zcard(key: string): Promise<number> {
    const current = this.store.get(key);
    if (!(current instanceof Map)) {
      return 0;
    }
    return current.size;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const current = this.store.get(key);
    if (!(current instanceof Map)) {
      return [];
    }
    const sorted = [...current.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
    return sorted.slice(start, stop + 1);
  }

  async zrem(key: string, member: string | string[]): Promise<void> {
    const current = this.store.get(key);
    if (!(current instanceof Map)) {
      return;
    }
    if (Array.isArray(member)) {
      for (const value of member) {
        current.delete(value);
      }
      return;
    }
    current.delete(member);
  }

  async mset<T>(keyValues: [string, T][], ttlSeconds?: number): Promise<void> {
    for (const [key, value] of keyValues) {
      // biome-ignore lint/performance/noAwaitInLoops: Test operations deliberately exercise state transitions in order.
      await this.set(key, value, ttlSeconds);
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async withCache<T>(key: string, callback: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await callback();
    if (value) {
      await this.set(key, value);
    }
    return value;
  }
}

const createStorageMock = () => {
  const storage: AbstractStorage = new (class extends AbstractStorage {
    createReadPresignedUrl = vi.fn(async () => ({
      expiresAt: 1_700_000_000_000,
      url: 'https://example.com/kv-log.jsonl',
    }));
    createWritePresignedUrl = vi.fn(async () => ({
      expiresAt: 1_700_000_000_000,
      method: 'PUT' as const,
      url: 'https://example.com/upload',
    }));
    delete = vi.fn(async () => undefined);
    objectMetadata = vi.fn(async () => {
      throw new Error('Unexpected metadata request');
    });
    read = vi.fn(async () => Buffer.from(''));
    write = vi.fn(async () => undefined);
    exists = vi.fn(async () => false);
  })({});

  return storage;
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const waitFor = async (
  predicate: () => Promise<boolean> | boolean,
  attempts = 20
) => {
  for (let index = 0; index < attempts; index += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Test operations deliberately exercise state transitions in order.
    if (await predicate()) {
      return;
    }
    await flush();
  }
  throw new Error('condition was not met');
};

describe('KvFileLogger', () => {
  it('writes queued entries to KV and closes to jsonl output', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();
    const logger = new KvFileLogger({
      key: 'logs/kv/test-1.jsonl',
      kv,
      mediatorKey: 'test-queue',
      metadata: { source: 'kv-test' },
      storage,
    });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    logger.info('entry.created', {
      cyclic,
      error: new Error('boom'),
      payload: { id: '123' },
    });

    await waitFor(async () => await kv.exists('lg:kv-file:test-queue:entry:1'));

    await logger.close();

    const content = vi.mocked(storage.write).mock.calls[0]?.[1];
    const lines =
      (Buffer.isBuffer(content) ? content.toString('utf8') : '').split('\n') ??
      [];
    expect(lines).toHaveLength(2);

    const metadata = JSON.parse(lines[0] ?? '{}');
    const entry = JSON.parse(lines[1] ?? '{}');
    expect(metadata.type).toBe('metadata');
    expect(metadata.metadata.source).toBe('kv-test');
    expect(entry.message).toBe('entry.created');
    expect(entry.metadata.payload).toBe('{"id":"123"}');
    expect(entry.metadata.cyclic).toBe('[object Object]');
    expect(typeof entry.metadata.error).toBe('object');
  });

  it('forwards to passthrough logger', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();
    const passthrough = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const logger = new KvFileLogger({
      key: 'logs/kv/test-2.jsonl',
      kv,
      mediatorKey: 'test-pass',
      passthrough,
      storage,
    });

    logger.debug('a', { a: 1 });
    logger.info('b', { b: 2 });
    logger.warn('c', { c: 3 });
    logger.error('d', { d: 4 });

    expect(passthrough.debug).toHaveBeenCalledWith('a', { a: 1 });
    expect(passthrough.info).toHaveBeenCalledWith('b', { b: 2 });
    expect(passthrough.warn).toHaveBeenCalledWith('c', { c: 3 });
    expect(passthrough.error).toHaveBeenCalledWith('d', { d: 4 });

    await logger.close();
  });

  it('drops oldest entries when maxEntries is exceeded', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();
    const logger = new KvFileLogger({
      key: 'logs/kv/test-3.jsonl',
      kv,
      maxEntries: 2,
      mediatorKey: 'test-drop',
      storage,
    });

    logger.info('entry-1');
    logger.info('entry-2');
    logger.info('entry-3');

    await logger.close();

    const written = vi.mocked(storage.write).mock.calls[0]?.[1];
    const content = Buffer.isBuffer(written) ? written.toString('utf8') : '';
    const lines = content?.split('\n') ?? [];
    const metadata = JSON.parse(lines[0] ?? '{}');
    const first = JSON.parse(lines[1] ?? '{}');
    const second = JSON.parse(lines[2] ?? '{}');
    expect(metadata.droppedEntryCount).toBe(1);
    expect(first.message).toBe('entry-2');
    expect(second.message).toBe('entry-3');
  });

  it('close is idempotent and concurrent-safe locally', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();
    const gate = createDeferred<void>();
    vi.mocked(storage.write).mockImplementationOnce(async () => {
      await gate.promise;
    });

    const logger = new KvFileLogger({
      key: 'logs/kv/test-4.jsonl',
      kv,
      mediatorKey: 'test-local-close',
      storage,
    });
    logger.info('entry');

    const firstClose = logger.close();
    const secondClose = logger.close();
    await waitFor(() => vi.mocked(storage.write).mock.calls.length === 1);
    gate.resolve();

    const first = await firstClose;
    const second = await secondClose;
    const third = await logger.close();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(vi.mocked(storage.write)).toHaveBeenCalledTimes(1);
  });

  it('close is distributed-idempotent across instances', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();

    const loggerA = new KvFileLogger({
      key: 'logs/kv/test-5.jsonl',
      kv,
      mediatorKey: 'test-distributed-close',
      storage,
    });
    loggerA.info('entry-from-a');

    const loggerB = new KvFileLogger({
      key: 'logs/kv/test-5.jsonl',
      kv,
      mediatorKey: 'test-distributed-close',
      storage,
    });

    const bResult = await loggerB.close();
    const aResult = await loggerA.close();

    expect(bResult).toEqual(aResult);
    expect(vi.mocked(storage.write)).toHaveBeenCalledTimes(1);
    expect(
      await kv.get('lg:kv-file:test-distributed-close:close-result')
    ).toEqual(bResult);
  });

  it('close cleans mediator keys and keeps close-result key', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();
    const logger = new KvFileLogger({
      key: 'logs/kv/test-6.jsonl',
      kv,
      mediatorKey: 'test-cleanup',
      storage,
    });
    logger.info('entry');
    await logger.close();

    expect(await kv.exists('lg:kv-file:test-cleanup:seq')).toBe(false);
    expect(await kv.exists('lg:kv-file:test-cleanup:dropped')).toBe(false);
    expect(await kv.exists('lg:kv-file:test-cleanup:started-at')).toBe(false);
    expect(await kv.exists('lg:kv-file:test-cleanup:meta')).toBe(false);
    expect(await kv.exists('lg:kv-file:test-cleanup:entry:1')).toBe(false);
    expect(await kv.exists('lg:kv-file:test-cleanup:close-result')).toBe(true);
  });

  it('failed close preserves mediator entries and allows retry', async () => {
    const kv = new InMemoryKeyValueService();
    const storage = createStorageMock();
    vi.mocked(storage.write)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    const logger = new KvFileLogger({
      key: 'logs/kv/test-7.jsonl',
      kv,
      mediatorKey: 'test-retry',
      storage,
    });
    logger.info('entry-before-failure');

    await expect(logger.close()).rejects.toThrow('write failed');
    expect(await kv.exists('lg:kv-file:test-retry:entry:1')).toBe(true);

    const result = await logger.close();
    expect(result.entryCount).toBe(1);
    expect(vi.mocked(storage.write)).toHaveBeenCalledTimes(2);
    expect(await kv.exists('lg:kv-file:test-retry:entry:1')).toBe(false);
  });
});
