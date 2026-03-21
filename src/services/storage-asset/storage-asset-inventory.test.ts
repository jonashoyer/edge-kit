/** biome-ignore-all lint/suspicious/useAwait: memory doubles are synchronous */
import { describe, expect, it } from 'vitest';
import type { StorageBody } from '../storage/abstract-storage';
import { AbstractStorage } from '../storage/abstract-storage';
import type {
  StorageAssetListPageOptions,
  StorageAssetListPageResult,
  StorageAssetRecord,
  UpsertStorageAssetInput,
} from './abstract-storage-asset';
import { AbstractStorageAssetService } from './abstract-storage-asset';
import { StorageAssetInventoryService } from './storage-asset-inventory';

type AssetMeta = {
  kind?: string;
  role?: string;
};

class MemoryStorage extends AbstractStorage {
  readonly objects = new Map<
    string,
    { data: StorageBody; contentType?: string }
  >();

  constructor() {
    super({});
  }

  override async write(
    key: string,
    data: StorageBody,
    opts?: { contentType?: string }
  ): Promise<void> {
    this.objects.set(key, {
      data,
      contentType: opts?.contentType,
    });
  }

  override async read(key: string): Promise<Buffer> {
    const value = this.objects.get(key);

    if (!value) {
      throw new Error(`Missing object: ${key}`);
    }

    return Buffer.from(value.data as Uint8Array);
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

  override async createWritePresignedUrl(): Promise<{
    url: string;
    method: 'PUT';
    expiresAt: number;
  }> {
    return {
      url: 'https://example.test/upload',
      method: 'PUT',
      expiresAt: Date.now() + 60_000,
    };
  }

  override async objectMetadata(): Promise<{
    contentLength: number;
    meta: never;
  }> {
    return {
      contentLength: 0,
      meta: undefined as never,
    };
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
      tags: input.tags ?? existing?.tags ?? [],
      meta: input.meta ?? existing?.meta ?? {},
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
    };

    this.assets.set(record.id, record);
    return record;
  }

  override async delete(id: string): Promise<void> {
    this.assets.delete(id);
  }
}

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
    expect(await inventory.get('asset-1')).toEqual(asset);
    expect(storage.objects.get('assets/asset-1.png')?.contentType).toBe(
      'image/png'
    );
  });

  it('registers existing objects without writing bytes again', async () => {
    const storage = new MemoryStorage();
    storage.objects.set('uploads/file.pdf', {
      data: new Uint8Array([9, 9]),
      contentType: 'application/pdf',
    });
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
    });

    const asset = await inventory.registerAsset({
      id: 'upload-1',
      objectKey: 'uploads/file.pdf',
      mimeType: 'application/pdf',
      source: 'uploaded',
      meta: { kind: 'upload' },
    });

    expect(asset.objectKey).toBe('uploads/file.pdf');
    expect(storage.objects.size).toBe(1);
  });

  it('reads bytes and presigned urls through the inventory id', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
    });

    await inventory.writeAsset({
      id: 'asset-1',
      objectKey: 'assets/asset-1.png',
      mimeType: 'image/png',
      source: 'generated',
      data: new Uint8Array([1, 2, 3]),
      meta: { kind: 'image-generation' },
    });

    const read = await inventory.readAsset('asset-1');
    const signed = await inventory.createReadAssetPresignedUrl('asset-1');

    expect([...read.body]).toEqual([1, 2, 3]);
    expect(signed.asset.id).toBe('asset-1');
    expect(signed.url).toContain('assets/asset-1.png');
  });

  it('deletes asset families from storage and the catalog when cascading', async () => {
    const storage = new MemoryStorage();
    const inventory = new StorageAssetInventoryService({
      storage,
      assetCatalog: new MemoryCatalog(),
    });

    await inventory.writeAsset({
      id: 'root',
      objectKey: 'generated/root/original.png',
      mimeType: 'image/png',
      source: 'generated',
      data: new Uint8Array([1]),
      meta: { kind: 'image-generation' },
    });
    await inventory.writeAsset({
      id: 'child',
      objectKey: 'generated/root/thumb.webp',
      mimeType: 'image/webp',
      source: 'generated',
      parentAssetId: 'root',
      data: new Uint8Array([2]),
      meta: { kind: 'image-generation', role: 'variant' },
    });

    await inventory.deleteAsset('root', {
      cascade: true,
    });

    expect(await inventory.get('root')).toBeNull();
    expect(await inventory.get('child')).toBeNull();
    expect(storage.objects.has('generated/root/original.png')).toBe(false);
    expect(storage.objects.has('generated/root/thumb.webp')).toBe(false);
  });
});
