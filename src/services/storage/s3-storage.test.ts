import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { S3Storage } from './s3-storage';

const { sendMock, clientOptions, commandInputs } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  clientOptions: [] as unknown[],
  commandInputs: new Map<string, unknown[]>(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  const registerCommand = (name: string, input: unknown) => {
    const entries = commandInputs.get(name) ?? [];
    entries.push(input);
    commandInputs.set(name, entries);
  };

  class S3Client {
    constructor(options: unknown) {
      clientOptions.push(options);
    }

    send = sendMock;
  }

  class PutObjectCommand {
    constructor(input: unknown) {
      registerCommand('PutObjectCommand', input);
    }
  }

  class GetObjectCommand {
    constructor(input: unknown) {
      registerCommand('GetObjectCommand', input);
    }
  }

  class HeadObjectCommand {
    constructor(input: unknown) {
      registerCommand('HeadObjectCommand', input);
    }
  }

  class DeleteObjectCommand {
    constructor(input: unknown) {
      registerCommand('DeleteObjectCommand', input);
    }
  }

  class DeleteObjectsCommand {
    constructor(input: unknown) {
      registerCommand('DeleteObjectsCommand', input);
    }
  }

  class ListObjectsV2Command {
    constructor(input: unknown) {
      registerCommand('ListObjectsV2Command', input);
    }
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));

describe('S3Storage', () => {
  beforeEach(() => {
    sendMock.mockReset();
    clientOptions.length = 0;
    commandInputs.clear();
    vi.mocked(getSignedUrl).mockReset();
    vi.mocked(createPresignedPost).mockReset();
  });

  it('writes metadata through provider-native object metadata', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    sendMock.mockResolvedValueOnce({});

    await storage.write('logs/file.ndjson', 'hello', {
      contentType: 'application/x-ndjson',
      metadata: {
        runId: 123,
      },
    });

    expect(commandInputs.get('PutObjectCommand')?.[0]).toMatchObject({
      Bucket: 'bucket',
      Key: 'logs/file.ndjson',
      ContentType: 'application/x-ndjson',
      Metadata: {
        runId: '123',
      },
    });
  });

  it('distinguishes not-found errors in exists()', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    sendMock.mockRejectedValueOnce({ name: 'NotFound' });

    await expect(storage.exists('missing.txt')).resolves.toBe(false);
  });

  it('deleteMany is a no-op for empty arrays', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    await storage.deleteMany([]);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('exposes paginated list results through explorer', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    sendMock.mockResolvedValueOnce({
      Contents: [{ Key: 'a.txt' }, { Key: undefined }, { Key: 'b.txt' }],
      NextContinuationToken: 'next-token',
    });

    const result = await storage.explorer.listPage('docs/', {
      maxKeys: 2,
      continuationToken: 'start',
    });

    expect(result).toEqual({
      keys: ['a.txt', 'b.txt'],
      continuationToken: 'next-token',
    });
  });

  it('aggregates list results through explorer.list()', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    sendMock
      .mockResolvedValueOnce({
        Contents: [{ Key: 'docs/a.txt' }],
        NextContinuationToken: 'next-token',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'docs/b.txt' }],
      });

    await expect(storage.explorer.list('docs/')).resolves.toEqual([
      'docs/a.txt',
      'docs/b.txt',
    ]);
  });

  it('creates POST presigned upload URLs and supports the bytesLimit alias', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    vi.mocked(createPresignedPost).mockResolvedValueOnce({
      url: 'https://upload.example',
      fields: {
        key: 'files/test.txt',
      },
    } as never);

    const startedAt = Date.now();
    const result = await storage.createWritePresignedUrl('files/test.txt', {
      contentType: 'text/plain',
      bytesLimit: 1024,
    });

    expect(result.method).toBe('POST');
    expect(result.fields).toEqual({ key: 'files/test.txt' });
    expect(result.expiresAt).toBeGreaterThan(startedAt);
    expect(vi.mocked(createPresignedPost)).toHaveBeenCalledTimes(1);
  });

  it('creates PUT presigned upload URLs for backblaze-style endpoints', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      endpoint: 'https://s3.us-west-001.backblazeb2.com',
      region: 'us-west-001',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://upload.example');

    const result = await storage.createWritePresignedUrl('files/test.txt', {
      contentType: 'text/plain',
      maxBytes: 1024,
    });

    expect(result).toEqual({
      url: 'https://upload.example',
      method: 'PUT',
      expiresAt: expect.any(Number),
    });
  });

  it('surfaces metadata through objectMetadata()', async () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    sendMock.mockResolvedValueOnce({
      ContentLength: 42,
      ContentType: 'text/plain',
      ETag: 'etag',
      LastModified: new Date('2026-03-14T12:00:00.000Z'),
      Metadata: {
        runId: '123',
      },
    });

    const result = await storage.objectMetadata<{ runId?: string }>('file.txt');

    expect(result).toEqual({
      contentLength: 42,
      contentType: 'text/plain',
      etag: 'etag',
      lastModified: new Date('2026-03-14T12:00:00.000Z').getTime(),
      meta: {
        runId: '123',
      },
    });
  });
});
