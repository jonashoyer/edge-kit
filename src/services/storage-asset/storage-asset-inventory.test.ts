/** biome-ignore-all lint/suspicious/useAwait: memory doubles are synchronous */

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { StorageBody } from '../storage/abstract-storage';
import {
  AbstractStorage,
  storageBodyToUint8Array,
} from '../storage/abstract-storage';
import {
  AbstractStorageAssetService,
  type ListOrphanedStorageAssetRootsOptions,
  type StorageAssetListPageOptions,
  type StorageAssetListPageResult,
  type StorageAssetRecord,
  type UpsertStorageAssetInput,
} from './abstract-storage-asset';
import {
  AbstractStorageAssetRefService,
  type DeleteStorageAssetOwnerRefInput,
  type StorageAssetOwnerRef,
  type StorageAssetOwnerRefScope,
  type UpsertStorageAssetOwnerRefInput,
} from './abstract-storage-asset-ref';
import {
  AbstractStorageUploadLedgerService,
  type ListExpiredStorageUploadsOptions,
  StorageUploadAlreadyConsumedError,
  type StorageUploadLedgerRecord,
  type UpsertStorageUploadLedgerInput,
} from './abstract-storage-upload-ledger';
import { StorageAssetInventoryService } from './storage-asset-inventory';
import {
  createSharpThumbHashPreviewMetadataBuilder,
  type StorageAssetPreviewMeta,
} from './storage-asset-preview';

type AssetMeta = StorageAssetPreviewMeta & {
  kind?: string;
  role?: string;
  existing?: string;
};

type UploadMeta = {
  flow?: string;
  completedBy?: string;
};

class MemoryStorage extends AbstractStorage {
  readonly objects = new Map<
    string,
    {
      data: Uint8Array;
      contentType?: string;
      etag?: string;
    }
  >();
  readCount = 0;

  constructor() {
    super({});
  }

  override async write(
    key: string,
    data: StorageBody,
    opts?: { contentType?: string }
  ): Promise<void> {
    const bytes = await storageBodyToUint8Array(data);
    this.objects.set(key, {
      data: bytes,
      contentType: opts?.contentType,
      etag: `etag:${key}`,
    });
  }

  override async read(key: string): Promise<Buffer> {
    this.readCount += 1;
    const value = this.objects.get(key);

    if (!value) {
      throw new Error(`Missing object: ${key}`);
    }

    return Buffer.from(value.data);
  }

  override async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  override async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  override async createReadPresignedUrl(
    key: string
  ): Promise<{ url: string; expiresAt: number }> {
    return {
      url: `https://example.test/${key}`,
      expiresAt: Date.now() + 60_000,
    };
  }

  override async createWritePresignedUrl(key: string): Promise<{
    url: string;
    method: 'PUT';
    expiresAt: number;
  }> {
    return {
      url: `https://example.test/upload/${key}`,
      method: 'PUT',
      expiresAt: Date.now() + 60_000,
    };
  }

  override async objectMetadata(key: string): Promise<{
    contentLength: number;
    contentType?: string;
    etag?: string;
    meta: never;
  }> {
    const value = this.objects.get(key);

    if (!value) {
      throw new Error(`Missing object metadata: ${key}`);
    }

    return {
      contentLength: value.data.byteLength,
      contentType: value.contentType,
      etag: value.etag,
      meta: undefined as never,
    };
  }
}

class CountingBlob extends Blob {
  arrayBufferCalls = 0;

  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.arrayBufferCalls += 1;
    return await super.arrayBuffer();
  }
}

class MemoryCatalog extends AbstractStorageAssetService<AssetMeta> {
  private readonly assets = new Map<string, StorageAssetRecord<AssetMeta>>();

  override async get(
    id: string
  ): Promise<StorageAssetRecord<AssetMeta> | null> {
    return this.assets.get(id) ?? null;
  }

  override async getMany(
    ids: string[]
  ): Promise<StorageAssetRecord<AssetMeta>[]> {
    return ids.flatMap((id) => {
      const asset = this.assets.get(id);
      return asset ? [asset] : [];
    });
  }

  override async listByParentIds(
    parentAssetIds: string[]
  ): Promise<StorageAssetRecord<AssetMeta>[]> {
    const allowed = new Set(parentAssetIds);

    return [...this.assets.values()].filter(
      (asset) =>
        asset.parentAssetId !== null && allowed.has(asset.parentAssetId)
    );
  }

  override async listPage(
    options: StorageAssetListPageOptions = {}
  ): Promise<StorageAssetListPageResult<AssetMeta>> {
    return {
      items: [...this.assets.values()].filter((asset) => {
        if (options.source !== undefined && asset.source !== options.source) {
          return false;
        }

        if (options.parentAssetId === undefined) {
          return true;
        }

        return asset.parentAssetId === options.parentAssetId;
      }),
    };
  }

  override async listOrphanedRoots(
    options: ListOrphanedStorageAssetRootsOptions = {}
  ): Promise<StorageAssetRecord<AssetMeta>[]> {
    return [...this.assets.values()].filter((asset) => {
      if (asset.parentAssetId !== null || asset.orphanedAt === null) {
        return false;
      }

      if (!options.olderThan) {
        return true;
      }

      return asset.orphanedAt.getTime() <= options.olderThan.getTime();
    });
  }

  override async upsert(
    input: UpsertStorageAssetInput<AssetMeta>
  ): Promise<StorageAssetRecord<AssetMeta>> {
    const existing = this.assets.get(input.id);
    const record: StorageAssetRecord<AssetMeta> = {
      id: input.id,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId ?? null,
      orphanedAt:
        input.orphanedAt === undefined
          ? (existing?.orphanedAt ?? null)
          : input.orphanedAt,
      tags: input.tags ?? existing?.tags ?? [],
      meta: input.meta ?? existing?.meta ?? {},
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
    };

    this.assets.set(record.id, record);
    return record;
  }

  override async setOrphanedAt(
    ids: string[],
    orphanedAt: Date | null
  ): Promise<void> {
    for (const id of ids) {
      const asset = this.assets.get(id);

      if (!asset) {
        continue;
      }

      this.assets.set(id, {
        ...asset,
        orphanedAt,
        updatedAt: new Date(),
      });
    }
  }

  override async resolveRoot(
    assetId: string
  ): Promise<StorageAssetRecord<AssetMeta> | null> {
    let current = this.assets.get(assetId) ?? null;

    while (current?.parentAssetId !== null) {
      current = this.assets.get(current.parentAssetId) ?? null;
    }

    return current;
  }

  override async delete(id: string): Promise<void> {
    this.assets.delete(id);
  }
}

class MemoryAssetRefService extends AbstractStorageAssetRefService {
  readonly refs = new Map<string, StorageAssetOwnerRef>();

  private keyOf(input: DeleteStorageAssetOwnerRefInput): string {
    return [
      input.tenantId ?? '',
      input.ownerType,
      input.ownerId,
      input.assetId,
    ].join(':');
  }

  override async listByOwner(
    scope: StorageAssetOwnerRefScope
  ): Promise<StorageAssetOwnerRef[]> {
    return [...this.refs.values()].filter(
      (ref) =>
        ref.ownerType === scope.ownerType &&
        ref.ownerId === scope.ownerId &&
        ref.tenantId === (scope.tenantId ?? null)
    );
  }

  override async listByAssetIds(
    assetIds: string[]
  ): Promise<StorageAssetOwnerRef[]> {
    const allowed = new Set(assetIds);
    return [...this.refs.values()].filter((ref) => allowed.has(ref.assetId));
  }

  override async upsert(
    input: UpsertStorageAssetOwnerRefInput
  ): Promise<StorageAssetOwnerRef> {
    const key = this.keyOf({
      assetId: input.assetId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      tenantId: input.tenantId,
    });
    const existing = this.refs.get(key);
    const record: StorageAssetOwnerRef = {
      assetId: input.assetId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      tenantId: input.tenantId ?? null,
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
    };

    this.refs.set(key, record);
    return record;
  }

  override async delete(input: DeleteStorageAssetOwnerRefInput): Promise<void> {
    this.refs.delete(this.keyOf(input));
  }

  override async deleteByAssetIds(assetIds: string[]): Promise<void> {
    const allowed = new Set(assetIds);

    for (const [key, ref] of this.refs.entries()) {
      if (allowed.has(ref.assetId)) {
        this.refs.delete(key);
      }
    }
  }
}

class MemoryUploadLedger extends AbstractStorageUploadLedgerService<UploadMeta> {
  readonly uploads = new Map<string, StorageUploadLedgerRecord<UploadMeta>>();

  override async get(
    id: string
  ): Promise<StorageUploadLedgerRecord<UploadMeta> | null> {
    return this.uploads.get(id) ?? null;
  }

  override async listExpired(
    options: ListExpiredStorageUploadsOptions = {}
  ): Promise<StorageUploadLedgerRecord<UploadMeta>[]> {
    const expiresBefore = options.expiresBefore ?? new Date();
    const statuses = new Set(options.statuses ?? ['ISSUED', 'UPLOADED']);

    return [...this.uploads.values()].filter((upload) => {
      if (!statuses.has(upload.status)) {
        return false;
      }

      if (
        options.tenantId !== undefined &&
        upload.tenantId !== options.tenantId
      ) {
        return false;
      }

      return upload.expiresAt.getTime() <= expiresBefore.getTime();
    });
  }

  override async upsert(
    input: UpsertStorageUploadLedgerInput<UploadMeta>
  ): Promise<StorageUploadLedgerRecord<UploadMeta>> {
    const existing = this.uploads.get(input.id);
    const record: StorageUploadLedgerRecord<UploadMeta> = {
      id: input.id,
      tenantId: input.tenantId ?? existing?.tenantId ?? null,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      status: input.status,
      sizeBytes:
        input.sizeBytes === undefined
          ? (existing?.sizeBytes ?? null)
          : input.sizeBytes,
      etag: input.etag === undefined ? (existing?.etag ?? null) : input.etag,
      expiresAt: input.expiresAt,
      issuedAt: input.issuedAt ?? existing?.issuedAt ?? new Date(),
      uploadedAt:
        input.uploadedAt === undefined
          ? (existing?.uploadedAt ?? null)
          : input.uploadedAt,
      consumedAt:
        input.consumedAt === undefined
          ? (existing?.consumedAt ?? null)
          : input.consumedAt,
      purgedAt:
        input.purgedAt === undefined
          ? (existing?.purgedAt ?? null)
          : input.purgedAt,
      meta: input.meta ?? existing?.meta ?? {},
    };

    this.uploads.set(record.id, record);
    return record;
  }
}

const createPngBytes = async (
  width: number,
  height: number
): Promise<Uint8Array> => {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: {
          r: 12,
          g: 140,
          b: 220,
          alpha: 1,
        },
      },
    })
      .png()
      .toBuffer()
  );
};

describe('StorageAssetInventoryService', () => {
  it('writes bytes and catalog rows together', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
    });

    const asset = await inventory.writeAsset({
      id: 'asset-1',
      objectKey: 'assets/asset-1.png',
      mimeType: 'image/png',
      source: 'generated',
      data: new Uint8Array([1, 2, 3]),
      tags: ['hero'],
      meta: { kind: 'image-generation', role: 'original' },
    });

    expect(asset.id).toBe('asset-1');
    expect(asset.orphanedAt).toBeNull();
    expect(await inventory.get('asset-1')).toEqual(asset);
    expect(storage.objects.get('assets/asset-1.png')?.contentType).toBe(
      'image/png'
    );
  });

  it('does not materialize blob input twice when preview generation is disabled', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
    });
    const blob = new CountingBlob([new Uint8Array([1, 2, 3])], {
      type: 'image/png',
    });

    await inventory.writeAsset({
      id: 'asset-blob',
      objectKey: 'assets/asset-blob.png',
      mimeType: 'image/png',
      source: 'generated',
      data: blob,
      meta: { kind: 'image-generation' },
    });

    expect(blob.arrayBufferCalls).toBe(1);
  });

  it('adds ThumbHash preview metadata for written image assets', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService<AssetMeta>({
      storage,
      assetCatalog: new MemoryCatalog(),
      previewMetadataBuilder:
        createSharpThumbHashPreviewMetadataBuilder<AssetMeta>(),
    });

    const asset = await inventory.writeAsset({
      id: 'asset-preview',
      objectKey: 'assets/asset-preview.png',
      mimeType: 'image/png',
      source: 'generated',
      data: await createPngBytes(240, 120),
      meta: {
        kind: 'image-generation',
        existing: 'preserved',
      },
    });

    expect(asset.meta.existing).toBe('preserved');
    expect(asset.meta.preview?.kind).toBe('thumbhash');
    expect(
      asset.meta.preview?.dataUrl.startsWith('data:image/png;base64,')
    ).toBe(true);
    expect(asset.meta.preview?.width).toBeLessThanOrEqual(100);
    expect(asset.meta.preview?.height).toBeLessThanOrEqual(100);
    expect(asset.meta.preview?.aspectRatio).toBeGreaterThan(1.5);
    expect(asset.meta.preview?.aspectRatio).toBeLessThan(2.1);
  });

  it('leaves non-image asset metadata unchanged when preview generation is configured', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService<AssetMeta>({
      storage,
      assetCatalog: new MemoryCatalog(),
      previewMetadataBuilder:
        createSharpThumbHashPreviewMetadataBuilder<AssetMeta>(),
    });

    const asset = await inventory.writeAsset({
      id: 'asset-text',
      objectKey: 'assets/asset-text.txt',
      mimeType: 'text/plain',
      source: 'uploaded',
      data: new TextEncoder().encode('hello'),
      meta: {
        existing: 'preserved',
      },
    });

    expect(asset.meta).toEqual({
      existing: 'preserved',
    });
  });

  it('fails open when preview generation throws during writeAsset', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService<AssetMeta>({
      storage,
      assetCatalog: new MemoryCatalog(),
      previewMetadataBuilder: async () => {
        throw new Error('preview failed');
      },
    });

    const asset = await inventory.writeAsset({
      id: 'asset-open-write',
      objectKey: 'assets/asset-open-write.png',
      mimeType: 'image/png',
      source: 'generated',
      data: await createPngBytes(32, 32),
      meta: {
        existing: 'preserved',
      },
    });

    expect(asset.meta).toEqual({
      existing: 'preserved',
    });
    expect(await inventory.get('asset-open-write')).not.toBeNull();
  });

  it('issues, completes, and finalizes uploads into assets', async () => {
    const storage = new MemoryStorage();
    const refs = new MemoryAssetRefService();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
      assetRefs: refs,
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.png`,
    });

    const issued = await inventory.issueUpload({
      id: 'upload-1',
      tenantId: 'tenant-a',
      mimeType: 'image/png',
      meta: { flow: 'avatar' },
    });

    await storage.write('uploads/upload-1.png', new Uint8Array([9, 8, 7]), {
      contentType: 'image/png',
    });

    const completed = await inventory.markUploadCompleted('upload-1', {
      sizeBytes: 3,
      etag: 'etag:complete',
      meta: { completedBy: 'browser' },
    });
    const finalized = await inventory.finalizeUpload({
      uploadId: 'upload-1',
      assetId: 'asset-upload-1',
      source: 'uploaded',
      meta: { kind: 'upload' },
      syncRefs: {
        ownerType: 'profile',
        ownerId: 'user-1',
        tenantId: 'tenant-a',
        assetIds: ['asset-upload-1'],
      },
    });

    expect(issued.upload.status).toBe('ISSUED');
    expect(completed.status).toBe('UPLOADED');
    expect(finalized.upload.status).toBe('CONSUMED');
    expect(finalized.asset.objectKey).toBe('uploads/upload-1.png');
    expect(finalized.asset.orphanedAt).toBeNull();
    expect(refs.refs.size).toBe(1);
  });

  it('does not read finalized uploads when preview generation is disabled', async () => {
    const storage = new MemoryStorage();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.png`,
    });

    await inventory.issueUpload({
      id: 'upload-no-preview',
      mimeType: 'image/png',
    });
    await storage.write(
      'uploads/upload-no-preview.png',
      await createPngBytes(32, 32),
      {
        contentType: 'image/png',
      }
    );
    await inventory.markUploadCompleted('upload-no-preview');

    await inventory.finalizeUpload({
      uploadId: 'upload-no-preview',
      assetId: 'asset-no-preview',
      source: 'uploaded',
      meta: {
        existing: 'preserved',
      },
    });

    expect(storage.readCount).toBe(0);
  });

  it('adds ThumbHash preview metadata when finalizing uploaded image assets', async () => {
    const storage = new MemoryStorage();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService<AssetMeta>({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.png`,
      previewMetadataBuilder:
        createSharpThumbHashPreviewMetadataBuilder<AssetMeta>(),
    });

    await inventory.issueUpload({
      id: 'upload-preview',
      mimeType: 'image/png',
    });
    await storage.write(
      'uploads/upload-preview.png',
      await createPngBytes(60, 180),
      {
        contentType: 'image/png',
      }
    );
    await inventory.markUploadCompleted('upload-preview');

    const finalized = await inventory.finalizeUpload({
      uploadId: 'upload-preview',
      assetId: 'asset-preview',
      source: 'uploaded',
      meta: {
        existing: 'preserved',
      },
    });

    expect(finalized.asset.meta.existing).toBe('preserved');
    expect(finalized.asset.meta.preview?.kind).toBe('thumbhash');
    expect(finalized.asset.meta.preview?.aspectRatio).toBeCloseTo(1 / 3, 1);
  });

  it('fails open when preview generation throws during finalizeUpload', async () => {
    const storage = new MemoryStorage();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService<AssetMeta>({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.png`,
      previewMetadataBuilder: async () => {
        throw new Error('preview failed');
      },
    });

    await inventory.issueUpload({
      id: 'upload-open',
      mimeType: 'image/png',
    });
    await storage.write(
      'uploads/upload-open.png',
      await createPngBytes(48, 48),
      {
        contentType: 'image/png',
      }
    );
    await inventory.markUploadCompleted('upload-open');

    const finalized = await inventory.finalizeUpload({
      uploadId: 'upload-open',
      assetId: 'asset-open',
      source: 'uploaded',
      meta: {
        existing: 'preserved',
      },
    });

    expect(finalized.upload.status).toBe('CONSUMED');
    expect(finalized.asset.meta).toEqual({
      existing: 'preserved',
    });
  });

  it('does not read finalized non-image uploads when preview generation is configured', async () => {
    const storage = new MemoryStorage();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService<AssetMeta>({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.txt`,
      previewMetadataBuilder:
        createSharpThumbHashPreviewMetadataBuilder<AssetMeta>(),
    });

    await inventory.issueUpload({
      id: 'upload-text',
      mimeType: 'text/plain',
    });
    await storage.write(
      'uploads/upload-text.txt',
      new TextEncoder().encode('hello'),
      {
        contentType: 'text/plain',
      }
    );
    await inventory.markUploadCompleted('upload-text');

    const finalized = await inventory.finalizeUpload({
      uploadId: 'upload-text',
      assetId: 'asset-text-upload',
      source: 'uploaded',
      meta: {
        existing: 'preserved',
      },
    });

    expect(storage.readCount).toBe(0);
    expect(finalized.asset.meta).toEqual({
      existing: 'preserved',
    });
  });

  it('rejects fractional preview maximum dimensions below one', () => {
    expect(() =>
      createSharpThumbHashPreviewMetadataBuilder({
        maximumDimension: 0.5,
      })
    ).toThrow(
      'Sharp ThumbHash preview maximumDimension must be an integer >= 1'
    );
  });

  it('rejects reissuing a consumed upload id', async () => {
    const storage = new MemoryStorage();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.png`,
    });

    await inventory.issueUpload({
      id: 'upload-1',
      mimeType: 'image/png',
      meta: { flow: 'avatar' },
    });
    await storage.write('uploads/upload-1.png', new Uint8Array([9, 8, 7]), {
      contentType: 'image/png',
    });
    await inventory.markUploadCompleted('upload-1');
    await inventory.finalizeUpload({
      uploadId: 'upload-1',
      assetId: 'asset-upload-1',
      source: 'uploaded',
      meta: { kind: 'upload' },
    });

    await expect(
      inventory.issueUpload({
        id: 'upload-1',
        mimeType: 'image/png',
      })
    ).rejects.toThrow(StorageUploadAlreadyConsumedError);
  });

  it('rejects finalizing uploads that were not marked uploaded', async () => {
    const storage = new MemoryStorage();
    const uploadLedger = new MemoryUploadLedger();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
      uploadKeyStrategy: (input) => `uploads/${input.id}.png`,
    });

    await inventory.issueUpload({
      id: 'upload-1',
      mimeType: 'image/png',
      meta: { flow: 'avatar' },
    });
    await storage.write('uploads/upload-1.png', new Uint8Array([9, 8, 7]), {
      contentType: 'image/png',
    });

    await expect(
      inventory.finalizeUpload({
        uploadId: 'upload-1',
        assetId: 'asset-upload-1',
        source: 'uploaded',
        meta: { kind: 'upload' },
      })
    ).rejects.toThrow(
      'Storage upload must be marked uploaded before finalization: upload-1'
    );
    await expect(inventory.get('asset-upload-1')).resolves.toBeNull();
  });

  it('syncs owner refs idempotently and applies family-root liveness', async () => {
    const storage = new MemoryStorage();
    const catalog = new MemoryCatalog();
    const refs = new MemoryAssetRefService();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: catalog,
      assetRefs: refs,
    });

    await catalog.create({
      id: 'root',
      objectKey: 'generated/root/original.png',
      mimeType: 'image/png',
      source: 'generated',
      meta: { kind: 'image-generation' },
    });
    await catalog.create({
      id: 'child',
      objectKey: 'generated/root/thumb.webp',
      mimeType: 'image/webp',
      source: 'generated',
      parentAssetId: 'root',
      meta: { kind: 'image-generation', role: 'variant' },
    });

    await inventory.syncAssetRefs({
      ownerType: 'post',
      ownerId: 'post-1',
      tenantId: 'tenant-a',
      assetIds: ['child'],
    });
    await inventory.syncAssetRefs({
      ownerType: 'post',
      ownerId: 'post-1',
      tenantId: 'tenant-a',
      assetIds: ['child'],
    });

    expect((await catalog.get('root'))?.orphanedAt).toBeNull();
    expect((await catalog.get('child'))?.orphanedAt).toBeNull();
    expect(refs.refs.size).toBe(1);

    await inventory.syncAssetRefs({
      ownerType: 'post',
      ownerId: 'post-1',
      tenantId: 'tenant-a',
      assetIds: [],
    });

    expect((await catalog.get('root'))?.orphanedAt).toBeInstanceOf(Date);
    expect((await catalog.get('child'))?.orphanedAt).toBeInstanceOf(Date);
  });

  it('keeps tenant-scoped owner refs isolated', async () => {
    const catalog = new MemoryCatalog();
    const refs = new MemoryAssetRefService();
    const inventory = new StorageAssetInventoryService({
      storage: new MemoryStorage(),
      assetCatalog: catalog,
      assetRefs: refs,
    });

    await catalog.create({
      id: 'asset-1',
      objectKey: 'uploads/asset-1.png',
      mimeType: 'image/png',
      source: 'uploaded',
      meta: { kind: 'upload' },
    });

    await inventory.attachAsset({
      assetId: 'asset-1',
      ownerType: 'profile',
      ownerId: 'user-1',
      tenantId: 'tenant-a',
    });
    await inventory.syncAssetRefs({
      ownerType: 'profile',
      ownerId: 'user-1',
      tenantId: 'tenant-b',
      assetIds: [],
    });

    expect(
      await refs.listByOwner({
        ownerType: 'profile',
        ownerId: 'user-1',
        tenantId: 'tenant-a',
      })
    ).toHaveLength(1);
  });

  it('purges expired pending uploads and scopes by tenant', async () => {
    const storage = new MemoryStorage();
    await storage.write('uploads/a.bin', new Uint8Array([1]), {
      contentType: 'application/octet-stream',
    });
    await storage.write('uploads/b.bin', new Uint8Array([2]), {
      contentType: 'application/octet-stream',
    });

    const uploadLedger = new MemoryUploadLedger();
    await uploadLedger.upsert({
      id: 'upload-a',
      tenantId: 'tenant-a',
      objectKey: 'uploads/a.bin',
      mimeType: 'application/octet-stream',
      status: 'ISSUED',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      meta: {},
    });
    await uploadLedger.upsert({
      id: 'upload-b',
      tenantId: 'tenant-b',
      objectKey: 'uploads/b.bin',
      mimeType: 'application/octet-stream',
      status: 'ISSUED',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      meta: {},
    });

    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
      uploadLedger,
    });

    const purged = await inventory.purgeExpiredUploads({
      expiresBefore: new Date('2026-03-02T00:00:00.000Z'),
      tenantId: 'tenant-a',
    });

    expect(purged.map((upload) => upload.id)).toEqual(['upload-a']);
    expect(storage.objects.has('uploads/a.bin')).toBe(false);
    expect(storage.objects.has('uploads/b.bin')).toBe(true);
    expect((await uploadLedger.get('upload-a'))?.status).toBe('PURGED');
    expect((await uploadLedger.get('upload-b'))?.status).toBe('ISSUED');
  });

  it('purges orphaned families and skips families that regained refs', async () => {
    const storage = new MemoryStorage();
    const catalog = new MemoryCatalog();
    const refs = new MemoryAssetRefService();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: catalog,
      assetRefs: refs,
    });
    const orphanedAt = new Date('2026-03-01T00:00:00.000Z');

    await storage.write('generated/root/original.png', new Uint8Array([1]), {
      contentType: 'image/png',
    });
    await storage.write('generated/root/thumb.webp', new Uint8Array([2]), {
      contentType: 'image/webp',
    });
    await storage.write('generated/skip/original.png', new Uint8Array([3]), {
      contentType: 'image/png',
    });

    await catalog.create({
      id: 'root',
      objectKey: 'generated/root/original.png',
      mimeType: 'image/png',
      source: 'generated',
      orphanedAt,
      meta: { kind: 'image-generation' },
    });
    await catalog.create({
      id: 'child',
      objectKey: 'generated/root/thumb.webp',
      mimeType: 'image/webp',
      source: 'generated',
      parentAssetId: 'root',
      orphanedAt,
      meta: { kind: 'image-generation', role: 'variant' },
    });
    await catalog.create({
      id: 'skip-root',
      objectKey: 'generated/skip/original.png',
      mimeType: 'image/png',
      source: 'generated',
      orphanedAt,
      meta: { kind: 'image-generation' },
    });

    await refs.upsert({
      assetId: 'skip-root',
      ownerType: 'post',
      ownerId: 'post-1',
      tenantId: 'tenant-a',
    });

    const purged = await inventory.purgeOrphanedAssets({
      olderThan: new Date('2026-03-02T00:00:00.000Z'),
    });

    expect(purged.map((asset) => asset.id)).toEqual(['root']);
    expect(await catalog.get('root')).toBeNull();
    expect(await catalog.get('child')).toBeNull();
    expect(storage.objects.has('generated/root/original.png')).toBe(false);
    expect(storage.objects.has('generated/root/thumb.webp')).toBe(false);
    expect(await catalog.get('skip-root')).not.toBeNull();
    expect((await catalog.get('skip-root'))?.orphanedAt).toBeNull();
  });
});
