import { describe, expect, it } from 'vitest';

import {
  AbstractStorageAssetService,
  decodeStorageAssetCursor,
  encodeStorageAssetCursor,
  StorageAssetAlreadyExistsError,
  type StorageAssetListPageOptions,
  type StorageAssetListPageResult,
  StorageAssetNotFoundError,
  type StorageAssetRecord,
  type UpsertStorageAssetInput,
} from './abstract-storage-asset';
import {
  createMySqlStorageAssetTable,
  createPostgresStorageAssetTable,
  createSqliteStorageAssetTable,
} from './drizzle-storage-asset';

type AssetMeta = {
  kind?: string;
  role?: string;
  position?: number;
};

class MemoryStorageAssetService extends AbstractStorageAssetService<AssetMeta> {
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

    return [...this.assets.values()]
      .filter(
        (asset) =>
          asset.parentAssetId !== null && allowed.has(asset.parentAssetId)
      )
      .sort((left, right) => {
        if (left.parentAssetId !== right.parentAssetId) {
          return (left.parentAssetId ?? '').localeCompare(
            right.parentAssetId ?? ''
          );
        }

        if (left.createdAt.getTime() !== right.createdAt.getTime()) {
          return left.createdAt.getTime() - right.createdAt.getTime();
        }

        return left.id.localeCompare(right.id);
      });
  }

  override async listPage(
    options: StorageAssetListPageOptions = {}
  ): Promise<StorageAssetListPageResult<AssetMeta>> {
    const order = options.order ?? 'desc';
    const filtered = [...this.assets.values()]
      .filter((asset) => {
        if (options.source !== undefined && asset.source !== options.source) {
          return false;
        }

        if (options.parentAssetId === undefined) {
          return true;
        }

        return asset.parentAssetId === options.parentAssetId;
      })
      .sort((left, right) => {
        const createdDiff =
          left.createdAt.getTime() - right.createdAt.getTime();

        if (createdDiff !== 0) {
          return order === 'asc' ? createdDiff : -createdDiff;
        }

        return order === 'asc'
          ? left.id.localeCompare(right.id)
          : right.id.localeCompare(left.id);
      });

    let startIndex = 0;

    if (options.cursor) {
      const cursor = decodeStorageAssetCursor(options.cursor);
      startIndex =
        filtered.findIndex(
          (asset) =>
            asset.id === cursor.id &&
            asset.createdAt.getTime() === cursor.createdAt
        ) + 1;
    }

    const limit = options.limit ?? 50;
    const page = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;
    const lastItem = page.at(-1);

    return {
      items: page,
      ...(hasMore && lastItem
        ? { nextCursor: encodeStorageAssetCursor(lastItem, order) }
        : {}),
    };
  }

  override async listOrphanedRoots(): Promise<StorageAssetRecord<AssetMeta>[]> {
    return [...this.assets.values()].filter(
      (asset) => asset.parentAssetId === null && asset.orphanedAt !== null
    );
  }

  override async upsert(
    input: UpsertStorageAssetInput<AssetMeta>
  ): Promise<StorageAssetRecord<AssetMeta>> {
    const existing = this.assets.get(input.id);
    const createdAt = input.createdAt ?? existing?.createdAt ?? new Date();
    const record: StorageAssetRecord<AssetMeta> = {
      createdAt,
      id: input.id,
      meta: input.meta ?? existing?.meta ?? {},
      mimeType: input.mimeType,
      objectKey: input.objectKey,
      orphanedAt:
        input.orphanedAt === undefined
          ? (existing?.orphanedAt ?? null)
          : input.orphanedAt,
      parentAssetId: input.parentAssetId ?? null,
      source: input.source,
      tags: [...new Set(input.tags ?? existing?.tags ?? [])],
      updatedAt: input.updatedAt ?? new Date(),
    };

    this.assets.set(record.id, record);
    return record;
  }

  override async delete(id: string): Promise<void> {
    this.assets.delete(id);
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

    while (current?.parentAssetId) {
      current = this.assets.get(current.parentAssetId) ?? null;
    }

    return current;
  }
}

describe('storage-asset helpers', () => {
  it('builds portable storage_asset table definitions for all supported dialects', () => {
    const mysqlTable = createMySqlStorageAssetTable<AssetMeta>();
    const postgresTable = createPostgresStorageAssetTable<AssetMeta>();
    const sqliteTable = createSqliteStorageAssetTable<AssetMeta>();

    expect(mysqlTable.id.name).toBe('id');
    expect(mysqlTable.objectKey.name).toBe('object_key');
    expect(postgresTable.parentAssetId.name).toBe('parent_asset_id');
    expect(postgresTable.orphanedAt.name).toBe('orphaned_at');
    expect(sqliteTable.createdAt.name).toBe('created_at');
    expect(sqliteTable.updatedAt.name).toBe('updated_at');
  });

  it('encodes and decodes composite cursors', () => {
    const cursor = encodeStorageAssetCursor(
      {
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        id: 'asset-1',
      },
      'asc'
    );

    expect(decodeStorageAssetCursor(cursor)).toEqual({
      createdAt: new Date('2026-03-19T08:00:00.000Z').getTime(),
      id: 'asset-1',
      order: 'asc',
    });
  });
});

describe('AbstractStorageAssetService contract', () => {
  it('stores and loads root and child assets', async () => {
    const service = new MemoryStorageAssetService();
    const createdAt = new Date('2026-03-19T08:00:00.000Z');
    const root = await service.create({
      createdAt,
      id: 'generation-1',
      meta: {
        kind: 'image-generation',
        role: 'original',
      },
      mimeType: 'image/png',
      objectKey: 'generated/generation-1/original.png',
      source: 'generated',
      tags: ['hero', 'hero', 'public'],
      updatedAt: createdAt,
    });

    const child = await service.create({
      createdAt,
      id: 'generation-1:thumb',
      meta: {
        kind: 'image-generation',
        position: 0,
        role: 'variant',
      },
      mimeType: 'image/webp',
      objectKey: 'generated/generation-1/variants/thumb.webp',
      parentAssetId: root.id,
      source: 'generated',
      tags: ['thumb'],
      updatedAt: createdAt,
    });

    expect(root.tags).toEqual(['hero', 'public']);
    expect(root.orphanedAt).toBeNull();
    expect(child.parentAssetId).toBe(root.id);
    expect(await service.get(root.id)).toEqual(root);
    expect(await service.listChildren(root.id)).toEqual([child]);
  });

  it('preserves createdAt on upsert and supports updates', async () => {
    const service = new MemoryStorageAssetService();
    const createdAt = new Date('2026-03-19T08:00:00.000Z');

    await service.upsert({
      createdAt,
      id: 'asset-1',
      meta: {
        kind: 'image-generation',
      },
      mimeType: 'image/png',
      objectKey: 'assets/original.png',
      source: 'generated',
      tags: ['one'],
      updatedAt: createdAt,
    });

    const updated = await service.upsert({
      id: 'asset-1',
      meta: {
        kind: 'image-generation',
        role: 'original',
      },
      mimeType: 'image/png',
      objectKey: 'assets/original-v2.png',
      source: 'generated',
      tags: ['two'],
    });

    expect(updated.createdAt).toEqual(createdAt);
    expect(updated.objectKey).toBe('assets/original-v2.png');
    expect(updated.tags).toEqual(['two']);

    const patchedAt = new Date('2026-03-19T09:00:00.000Z');
    const patched = await service.update('asset-1', {
      orphanedAt: patchedAt,
      parentAssetId: null,
      updatedAt: patchedAt,
    });

    expect(patched.updatedAt).toEqual(patchedAt);
    expect(patched.parentAssetId).toBeNull();
    expect(patched.orphanedAt).toEqual(patchedAt);
  });

  it('lists pages with source and root filters using a composite cursor', async () => {
    const service = new MemoryStorageAssetService();
    const sharedCreatedAt = new Date('2026-03-19T08:00:00.000Z');
    const earlierCreatedAt = new Date('2026-03-19T07:00:00.000Z');

    await service.create({
      createdAt: sharedCreatedAt,
      id: 'b',
      meta: {},
      mimeType: 'image/png',
      objectKey: 'generated/b/original.png',
      source: 'generated',
      updatedAt: sharedCreatedAt,
    });
    await service.create({
      createdAt: sharedCreatedAt,
      id: 'a',
      meta: {},
      mimeType: 'image/png',
      objectKey: 'generated/a/original.png',
      source: 'generated',
      updatedAt: sharedCreatedAt,
    });
    await service.create({
      createdAt: sharedCreatedAt,
      id: 'child',
      meta: {},
      mimeType: 'image/webp',
      objectKey: 'generated/a/variants/thumb.webp',
      parentAssetId: 'a',
      source: 'generated',
      updatedAt: sharedCreatedAt,
    });
    await service.create({
      createdAt: earlierCreatedAt,
      id: 'c',
      meta: {},
      mimeType: 'image/png',
      objectKey: 'uploads/c/original.png',
      source: 'uploaded',
      updatedAt: earlierCreatedAt,
    });

    const firstPage = await service.listPage({
      limit: 1,
      order: 'desc',
      parentAssetId: null,
      source: 'generated',
    });

    expect(firstPage.items.map((item) => item.id)).toEqual(['b']);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await service.listPage({
      cursor: firstPage.nextCursor,
      limit: 5,
      order: 'desc',
      parentAssetId: null,
      source: 'generated',
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(['a']);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('returns rows ordered to match getMany input ids', async () => {
    const service = new MemoryStorageAssetService();
    const createdAt = new Date('2026-03-19T08:00:00.000Z');

    for (const id of ['a', 'b', 'c']) {
      // biome-ignore lint/performance/noAwaitInLoops: Test operations deliberately exercise state transitions in order.
      await service.create({
        createdAt,
        id,
        meta: {},
        mimeType: 'image/png',
        objectKey: `generated/${id}/original.png`,
        source: 'generated',
        updatedAt: createdAt,
      });
    }

    const items = await service.getMany(['c', 'a', 'missing', 'b']);

    expect(items.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('tracks orphan roots and resolves family roots', async () => {
    const service = new MemoryStorageAssetService();
    const createdAt = new Date('2026-03-19T08:00:00.000Z');

    await service.create({
      createdAt,
      id: 'root',
      meta: {},
      mimeType: 'image/png',
      objectKey: 'generated/root/original.png',
      source: 'generated',
      updatedAt: createdAt,
    });
    await service.create({
      createdAt,
      id: 'child',
      meta: {},
      mimeType: 'image/webp',
      objectKey: 'generated/root/variants/thumb.webp',
      parentAssetId: 'root',
      source: 'generated',
      updatedAt: createdAt,
    });

    const orphanedAt = new Date('2026-03-20T08:00:00.000Z');
    await service.setOrphanedAt(['root', 'child'], orphanedAt);

    const orphaned = await service.listOrphanedRoots();

    expect(orphaned.map((asset) => asset.id)).toEqual(['root']);
    expect((await service.resolveRoot('child'))?.id).toBe('root');
  });

  it('throws targeted errors for duplicate creates and missing updates', async () => {
    const service = new MemoryStorageAssetService();
    const createdAt = new Date('2026-03-19T08:00:00.000Z');

    await service.create({
      createdAt,
      id: 'asset-1',
      meta: {},
      mimeType: 'image/png',
      objectKey: 'generated/asset-1/original.png',
      source: 'generated',
      updatedAt: createdAt,
    });

    await expect(
      service.create({
        id: 'asset-1',
        meta: {},
        mimeType: 'image/png',
        objectKey: 'generated/asset-1/original.png',
        source: 'generated',
      })
    ).rejects.toBeInstanceOf(StorageAssetAlreadyExistsError);

    await expect(
      service.update('missing', { source: 'generated' })
    ).rejects.toBeInstanceOf(StorageAssetNotFoundError);
  });
});
