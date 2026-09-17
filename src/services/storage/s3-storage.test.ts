import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageMultipartUploadError } from './abstract-storage';
import { BackblazeStorage } from './backblaze-storage';
import { R2Storage } from './r2-storage';
import { S3Storage } from './s3-storage';

const { sendMock, clientOptions, commandInputs } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  clientOptions: [] as Record<string, unknown>[],
  commandInputs: new Map<string, unknown[]>(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  const registerCommand = (name: string, input: unknown) => {
    const entries = commandInputs.get(name) ?? [];
    entries.push(input);
    commandInputs.set(name, entries);
  };

  class S3Client {
    readonly config: { maxAttempts: () => Promise<number> };

    constructor(options: Record<string, unknown>) {
      clientOptions.push(options);
      this.config = {
        maxAttempts: async () => Number(options.maxAttempts ?? 3),
      };
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

  class CreateMultipartUploadCommand {
    constructor(input: unknown) {
      registerCommand('CreateMultipartUploadCommand', input);
    }
  }

  class ListMultipartUploadsCommand {
    constructor(input: unknown) {
      registerCommand('ListMultipartUploadsCommand', input);
    }
  }

  class ListPartsCommand {
    constructor(input: unknown) {
      registerCommand('ListPartsCommand', input);
    }
  }

  class UploadPartCommand {
    constructor(input: unknown) {
      registerCommand('UploadPartCommand', input);
    }
  }

  class CompleteMultipartUploadCommand {
    constructor(input: unknown) {
      registerCommand('CompleteMultipartUploadCommand', input);
    }
  }

  class AbortMultipartUploadCommand {
    constructor(input: unknown) {
      registerCommand('AbortMultipartUploadCommand', input);
    }
  }

  class ListObjectVersionsCommand {
    constructor(input: unknown) {
      registerCommand('ListObjectVersionsCommand', input);
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
    CreateMultipartUploadCommand,
    ListMultipartUploadsCommand,
    ListPartsCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    ListObjectVersionsCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));

const createVersionedStorage = () =>
  new S3Storage({
    bucket: 'bucket',
    region: 'eu-west-1',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    maxAttempts: 1,
    versioning: 'enabled',
  });

describe('S3Storage', () => {
  beforeEach(() => {
    sendMock.mockReset();
    clientOptions.length = 0;
    commandInputs.clear();
    vi.mocked(getSignedUrl).mockReset();
    vi.mocked(createPresignedPost).mockReset();
  });

  it('keeps immutable capability absent until versioning is explicitly configured', () => {
    const storage = new S3Storage({
      bucket: 'bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    expect(storage.immutable).toBeUndefined();
    expect(storage.multipart).toBeDefined();
  });

  it('keeps R2 and Backblaze multipart and immutable capabilities absent', () => {
    const r2 = new R2Storage({
      accountId: 'account',
      bucket: 'bucket',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });
    const backblaze = new BackblazeStorage({
      accountId: 'account',
      bucket: 'bucket',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    expect(r2.immutable).toBeUndefined();
    expect(r2.multipart).toBeUndefined();
    expect(backblaze.immutable).toBeUndefined();
    expect(backblaze.multipart).toBeUndefined();
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

  it('creates immutable objects conditionally and returns the stored descriptor', async () => {
    const storage = createVersionedStorage();

    sendMock.mockResolvedValueOnce({}).mockResolvedValueOnce({
      ContentLength: 5,
      ContentType: 'text/plain',
      ETag: '"etag-1"',
      VersionId: 'version-1',
      ChecksumSHA256: 'digest-1',
      LastModified: new Date('2026-09-17T12:00:00.000Z'),
      Metadata: {
        source: 'tests',
      },
    });

    const result = await storage.immutable?.createObject<{ source?: string }>(
      'objects/file.txt',
      'hello',
      {
        contentType: 'text/plain',
        metadata: { source: 'tests' },
        checksum: { algorithm: 'sha256', value: 'digest-1' },
      }
    );

    expect(result).toEqual({
      status: 'created',
      object: {
        key: 'objects/file.txt',
        contentLength: 5,
        contentType: 'text/plain',
        etag: '"etag-1"',
        versionId: 'version-1',
        checksum: {
          algorithm: 'sha256',
          value: 'digest-1',
        },
        lastModified: new Date('2026-09-17T12:00:00.000Z').getTime(),
        meta: {
          source: 'tests',
        },
      },
    });
    expect(commandInputs.get('PutObjectCommand')?.[0]).toMatchObject({
      Bucket: 'bucket',
      Key: 'objects/file.txt',
      IfNoneMatch: '*',
      ChecksumAlgorithm: 'SHA256',
      ChecksumSHA256: 'digest-1',
    });
  });

  it('returns already-exists when a conditional object write conflicts', async () => {
    const storage = createVersionedStorage();

    sendMock
      .mockRejectedValueOnce({
        $metadata: { httpStatusCode: 412 },
      })
      .mockResolvedValueOnce({
        ContentLength: 5,
        ContentType: 'text/plain',
        ETag: '"etag-1"',
        VersionId: 'version-1',
      });

    const result = await storage.immutable?.createObject(
      'objects/file.txt',
      'hello',
      {
        contentType: 'text/plain',
      }
    );

    expect(result?.status).toBe('already-exists');
    expect(commandInputs.get('HeadObjectCommand')?.[0]).toMatchObject({
      Bucket: 'bucket',
      Key: 'objects/file.txt',
    });
  });

  it('creates pinned read grants from immutable references', async () => {
    const storage = createVersionedStorage();

    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://download.example');

    const result = await storage.immutable?.createReadPresignedUrl({
      key: 'objects/file.txt',
      versionId: 'version-1',
    });

    expect(result).toEqual({
      url: 'https://download.example',
      expiresAt: expect.any(Number),
    });
    expect(commandInputs.get('GetObjectCommand')?.[0]).toMatchObject({
      Bucket: 'bucket',
      Key: 'objects/file.txt',
      VersionId: 'version-1',
      ResponseCacheControl: 'private, no-store',
    });
  });

  it('surfaces per-version cleanup errors when deleting all versions', async () => {
    const storage = createVersionedStorage();

    sendMock
      .mockResolvedValueOnce({
        Versions: [
          { Key: 'objects/file.txt', VersionId: 'v1' },
          { Key: 'objects/file.txt-extra', VersionId: 'skip' },
        ],
        DeleteMarkers: [{ Key: 'objects/file.txt', VersionId: 'd1' }],
        IsTruncated: true,
        NextKeyMarker: 'objects/file.txt',
        NextVersionIdMarker: 'marker-2',
      })
      .mockResolvedValueOnce({
        Deleted: [{ Key: 'objects/file.txt', VersionId: 'v1' }],
      })
      .mockResolvedValueOnce({
        Versions: [{ Key: 'objects/file.txt', VersionId: 'v2' }],
        DeleteMarkers: [],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Errors: [
          {
            Key: 'objects/file.txt',
            VersionId: 'v2',
            Code: 'AccessDenied',
            Message: 'Denied',
          },
        ],
      });

    await expect(
      storage.immutable?.delete('objects/file.txt', { mode: 'all-versions' })
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'DELETE_FAILED',
        errors: [
          {
            key: 'objects/file.txt',
            versionId: 'v2',
            code: 'AccessDenied',
            message: 'Denied',
          },
        ],
      })
    );
    expect(commandInputs.get('DeleteObjectsCommand')).toEqual([
      {
        Bucket: 'bucket',
        Delete: {
          Objects: [
            { Key: 'objects/file.txt', VersionId: 'v1' },
            { Key: 'objects/file.txt', VersionId: 'd1' },
          ],
        },
      },
      {
        Bucket: 'bucket',
        Delete: {
          Objects: [{ Key: 'objects/file.txt', VersionId: 'v2' }],
        },
      },
    ]);
  });

  it('discovers multipart uploads by exact key across pages', async () => {
    const storage = createVersionedStorage();

    sendMock
      .mockResolvedValueOnce({
        Uploads: [
          { Key: 'objects/file.txt', UploadId: 'upload-1' },
          { Key: 'objects/file.txt-partial', UploadId: 'skip' },
        ],
        IsTruncated: true,
        NextKeyMarker: 'objects/file.txt',
        NextUploadIdMarker: 'marker-2',
      })
      .mockResolvedValueOnce({
        Uploads: [{ Key: 'objects/file.txt', UploadId: 'upload-2' }],
        IsTruncated: false,
      });

    await expect(storage.multipart?.find('objects/file.txt')).resolves.toEqual([
      { key: 'objects/file.txt', uploadId: 'upload-1' },
      { key: 'objects/file.txt', uploadId: 'upload-2' },
    ]);
  });

  it('rejects invalid multipart pagination markers', async () => {
    const storage = createVersionedStorage();

    sendMock.mockResolvedValueOnce({
      Uploads: [{ Key: 'objects/file.txt', UploadId: 'upload-1' }],
      IsTruncated: true,
      NextKeyMarker: undefined,
      NextUploadIdMarker: 'marker-2',
    });

    await expect(storage.multipart?.find('objects/file.txt')).rejects.toThrow(
      'Invalid multipart pagination state'
    );
  });

  it('signs multipart parts with exact bounds for the requested part', async () => {
    const storage = createVersionedStorage();

    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      'https://upload-part.example'
    );

    const result = await storage.multipart?.createPartPresignedUrl(
      {
        key: 'objects/file.txt',
        uploadId: 'upload-1',
        expectedBytes: 20,
        partSizeBytes: 8,
        partCount: 3,
      },
      3,
      {
        contentType: 'video/webm',
      }
    );

    expect(result).toEqual({
      key: 'objects/file.txt',
      uploadId: 'upload-1',
      partNumber: 3,
      method: 'PUT',
      url: 'https://upload-part.example',
      headers: {
        'Content-Type': 'video/webm',
      },
      expiresAt: expect.any(Number),
      offsetBytes: 16,
      lengthBytes: 4,
      maxBytes: 4,
    });
    expect(commandInputs.get('UploadPartCommand')?.[0]).toMatchObject({
      Bucket: 'bucket',
      Key: 'objects/file.txt',
      UploadId: 'upload-1',
      PartNumber: 3,
      ContentLength: 4,
    });
    expect(vi.mocked(getSignedUrl).mock.calls[0]?.[2]).toMatchObject({
      expiresIn: 900,
      signableHeaders: expect.any(Set),
    });
  });

  it('validates multipart parts before completion and returns the stored descriptor', async () => {
    const storage = createVersionedStorage();

    sendMock
      .mockResolvedValueOnce({
        Parts: [{ PartNumber: 1, ETag: '"part-1"', Size: 8 }],
        IsTruncated: true,
        NextPartNumberMarker: 1,
      })
      .mockResolvedValueOnce({
        Parts: [{ PartNumber: 2, ETag: '"part-2"', Size: 4 }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        VersionId: 'version-2',
      })
      .mockResolvedValueOnce({
        ContentLength: 12,
        ContentType: 'video/webm',
        ETag: '"etag-2"',
        VersionId: 'version-2',
      });

    const result = await storage.multipart?.complete(
      {
        key: 'objects/file.txt',
        uploadId: 'upload-1',
        expectedBytes: 12,
        partSizeBytes: 8,
        partCount: 2,
      },
      {
        contentType: 'video/webm',
      }
    );

    expect(result).toEqual({
      key: 'objects/file.txt',
      contentLength: 12,
      contentType: 'video/webm',
      etag: '"etag-2"',
      versionId: 'version-2',
      checksum: undefined,
      lastModified: undefined,
      meta: undefined,
    });
    expect(
      commandInputs.get('CompleteMultipartUploadCommand')?.[0]
    ).toMatchObject({
      Bucket: 'bucket',
      Key: 'objects/file.txt',
      UploadId: 'upload-1',
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: '"part-1"' },
          { PartNumber: 2, ETag: '"part-2"' },
        ],
      },
    });
  });

  it('rejects multipart completion when part sizes do not match the declared layout', async () => {
    const storage = createVersionedStorage();

    sendMock.mockResolvedValueOnce({
      Parts: [{ PartNumber: 1, ETag: '"part-1"', Size: 7 }],
      IsTruncated: false,
    });

    await expect(
      storage.multipart?.complete(
        {
          key: 'objects/file.txt',
          uploadId: 'upload-1',
          expectedBytes: 8,
          partSizeBytes: 8,
          partCount: 1,
        },
        {
          contentType: 'video/webm',
        }
      )
    ).rejects.toBeInstanceOf(StorageMultipartUploadError);
  });

  it('keeps abort outcomes visible when parts remain after abort verification', async () => {
    const storage = createVersionedStorage();

    sendMock.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Parts: [{ PartNumber: 1, ETag: '"part-1"', Size: 8 }],
      IsTruncated: false,
    });

    await expect(
      storage.multipart?.abort({
        key: 'objects/file.txt',
        uploadId: 'upload-1',
      })
    ).rejects.toBeInstanceOf(StorageMultipartUploadError);
  });
});
