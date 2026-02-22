import { describe, expect, it, vi } from 'vitest';
import type { AbstractStorage } from '../storage/abstract-storage';
import { FileLogger } from './file-logger';

const createStorageMock = () => {
  const storage: AbstractStorage = {
    write: vi.fn(async () => undefined),
    read: vi.fn(async () => Buffer.from('')),
    delete: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    createReadPresignedUrl: vi.fn(async () => ({
      url: 'https://example.com/log.jsonl',
      expiresAt: 1_700_000_000_000,
    })),
    createWritePresignedUrl: vi.fn(async () => ({
      url: 'https://example.com/upload',
      method: 'PUT',
      expiresAt: 1_700_000_000_000,
    })),
    objectMetadata: vi.fn(async () => ({ contentLength: 0, meta: undefined })),
  };

  return storage;
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('FileLogger', () => {
  it('appends entries and normalizes metadata safely', async () => {
    const storage = createStorageMock();
    const logger = new FileLogger({
      key: 'logs/file-logger/test-1.jsonl',
      storage,
      metadata: { source: 'test' },
    });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    logger.info('entry.created', {
      cyclic,
      payload: { id: '123' },
      error: new Error('boom'),
    });

    expect(logger.entryCount).toBe(1);

    await logger.close();

    const content = vi.mocked(storage.write).mock.calls[0]?.[1];
    expect(Buffer.isBuffer(content)).toBe(true);
    const lines = content?.toString('utf8').split('\n') ?? [];
    expect(lines).toHaveLength(2);

    const metadata = JSON.parse(lines[0] ?? '{}');
    const entry = JSON.parse(lines[1] ?? '{}');
    expect(metadata.type).toBe('metadata');
    expect(metadata.metadata.source).toBe('test');
    expect(entry.message).toBe('entry.created');
    expect(entry.metadata.payload).toBe('{"id":"123"}');
    expect(entry.metadata.cyclic).toBe('[object Object]');
    expect(typeof entry.metadata.error).toBe('object');
  });

  it('forwards logs to passthrough logger', () => {
    const storage = createStorageMock();
    const passthrough = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = new FileLogger({
      key: 'logs/file-logger/test-2.jsonl',
      storage,
      passthrough,
    });

    logger.debug('debug.message', { a: 1 });
    logger.info('info.message', { b: 2 });
    logger.warn('warn.message', { c: 3 });
    logger.error('error.message', { d: 4 });

    expect(passthrough.debug).toHaveBeenCalledWith('debug.message', { a: 1 });
    expect(passthrough.info).toHaveBeenCalledWith('info.message', { b: 2 });
    expect(passthrough.warn).toHaveBeenCalledWith('warn.message', { c: 3 });
    expect(passthrough.error).toHaveBeenCalledWith('error.message', { d: 4 });
  });

  it('enforces maxEntries and drops oldest entries', async () => {
    const storage = createStorageMock();
    const logger = new FileLogger({
      key: 'logs/file-logger/test-3.jsonl',
      storage,
      maxEntries: 2,
    });

    logger.info('entry-1');
    logger.info('entry-2');
    logger.info('entry-3');

    expect(logger.entryCount).toBe(2);

    await logger.close();

    const content = vi
      .mocked(storage.write)
      .mock.calls[0]?.[1].toString('utf8');
    const lines = content?.split('\n') ?? [];
    const metadata = JSON.parse(lines[0] ?? '{}');
    const first = JSON.parse(lines[1] ?? '{}');
    const second = JSON.parse(lines[2] ?? '{}');

    expect(metadata.droppedEntryCount).toBe(1);
    expect(first.message).toBe('entry-2');
    expect(second.message).toBe('entry-3');
  });

  it('close is idempotent and concurrent-safe', async () => {
    const storage = createStorageMock();
    const gate = createDeferred<void>();
    vi.mocked(storage.write).mockImplementationOnce(async () => {
      await gate.promise;
    });

    const logger = new FileLogger({
      key: 'logs/file-logger/test-4.jsonl',
      storage,
    });
    logger.info('entry');

    const firstClose = logger.close();
    const secondClose = logger.close();
    gate.resolve();

    const first = await firstClose;
    const second = await secondClose;
    const third = await logger.close();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(vi.mocked(storage.write)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(storage.createReadPresignedUrl)).toHaveBeenCalledTimes(1);
  });

  it('keeps entries for retry when close fails', async () => {
    const storage = createStorageMock();
    vi.mocked(storage.write)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    const logger = new FileLogger({
      key: 'logs/file-logger/test-5.jsonl',
      storage,
    });
    logger.info('entry-before-failure');

    await expect(logger.close()).rejects.toThrow('write failed');
    expect(logger.isClosed).toBe(false);
    expect(logger.entryCount).toBe(1);

    const result = await logger.close();
    expect(result.entryCount).toBe(1);
    expect(vi.mocked(storage.write)).toHaveBeenCalledTimes(2);
  });
});
