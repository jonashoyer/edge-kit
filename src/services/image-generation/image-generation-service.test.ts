/** biome-ignore-all lint/suspicious/useAwait: fake storage is synchronous */
import { beforeEach, describe, expect, it } from 'vitest';

import type { StorageBody } from '../storage/abstract-storage';
import { AbstractStorage } from '../storage/abstract-storage';
import type {
  StorageAssetListPageOptions,
  StorageAssetListPageResult,
  StorageAssetRecord,
  UpsertStorageAssetInput,
} from '../storage-asset/abstract-storage-asset';
import {
  AbstractStorageAssetService,
  decodeStorageAssetCursor,
  encodeStorageAssetCursor,
} from '../storage-asset/abstract-storage-asset';
import { StorageAssetInventoryService } from '../storage-asset/storage-asset-inventory';
import type { StorageAssetPreviewMeta } from '../storage-asset/storage-asset-preview';
import {
  AbstractImageGenerator,
  type ImageGenerationOutput,
  type ImageGenerationRequest,
} from './abstract-image-generator';
import {
  AbstractImageResizer,
  createImageResizeVariantProducers,
} from './abstract-image-resizer';
import {
  ImageGenerationInventoryUnavailableError,
  ImageGenerationService,
  ImageGenerationStorageUnavailableError,
} from './image-generation-service';

class MemoryStorage extends AbstractStorage {
  readonly objects = new Map<
    string,
    {
      data: StorageBody;
      contentType?: string;
    }
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
    const stored = this.objects.get(key);

    if (!stored) {
      throw new Error(`Missing object: ${key}`);
    }

    return Buffer.from(stored.data as Uint8Array);
  }

  override async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  override async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  override async createReadPresignedUrl(key: string): Promise<{
    url: string;
    expiresAt: number;
  }> {
    return {
      url: `https://example.test/read/${key}`,
      expiresAt: Date.now() + 60_000,
    };
  }

  override async createWritePresignedUrl(): Promise<{
    url: string;
    method: 'PUT';
    expiresAt: number;
  }> {
    return {
      url: 'https://example.test/write',
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

class MemoryStorageAssetService extends AbstractStorageAssetService<object> {
  private readonly assets = new Map<string, StorageAssetRecord<object>>();

  override async get(id: string): Promise<StorageAssetRecord<object> | null> {
    return this.assets.get(id) ?? null;
  }

  override async getMany(ids: string[]): Promise<StorageAssetRecord<object>[]> {
    return ids.flatMap((id) => {
      const asset = this.assets.get(id);
      return asset ? [asset] : [];
    });
  }

  override async listByParentIds(
    parentAssetIds: string[]
  ): Promise<StorageAssetRecord<object>[]> {
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
  ): Promise<StorageAssetListPageResult<object>> {
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

  override async listOrphanedRoots(): Promise<StorageAssetRecord<object>[]> {
    return [...this.assets.values()].filter(
      (asset) => asset.parentAssetId === null && asset.orphanedAt !== null
    );
  }

  override async upsert(
    input: UpsertStorageAssetInput<object>
  ): Promise<StorageAssetRecord<object>> {
    const existing = this.assets.get(input.id);
    const createdAt = input.createdAt ?? existing?.createdAt ?? new Date();
    const record: StorageAssetRecord<object> = {
      id: input.id,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId ?? null,
      orphanedAt:
        input.orphanedAt === undefined
          ? (existing?.orphanedAt ?? null)
          : input.orphanedAt,
      tags: [...new Set(input.tags ?? existing?.tags ?? [])],
      meta: input.meta ?? existing?.meta ?? {},
      createdAt,
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
  ): Promise<StorageAssetRecord<object> | null> {
    let current = this.assets.get(assetId) ?? null;

    while (current?.parentAssetId !== null) {
      current = this.assets.get(current.parentAssetId) ?? null;
    }

    return current;
  }
}

class FakeImageGenerator extends AbstractImageGenerator<ImageGenerationRequest> {
  readonly provider = 'fake-provider';

  override async generate(): Promise<ImageGenerationOutput> {
    return {
      model: 'fake-model',
      revisedPrompt: 'revised hero prompt',
      providerMeta: {
        costUsd: 0.02,
      },
      image: {
        data: new Uint8Array([1, 2, 3, 4]),
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        altText: 'Generated hero image',
      },
    };
  }
}

class FakeImageResizer extends AbstractImageResizer {
  override async resize({
    image,
    width,
    height,
    format,
  }: {
    image: {
      data: StorageBody;
      mimeType: string;
      width?: number;
      height?: number;
      altText?: string;
    };
    width?: number;
    height?: number;
    format?: string;
  }) {
    return {
      data: new Uint8Array([9, 8, 7]),
      mimeType: format ? `image/${format}` : image.mimeType,
      width,
      height,
      altText: image.altText,
    };
  }
}

describe('ImageGenerationService', () => {
  let storage: MemoryStorage;
  let assetCatalog: MemoryStorageAssetService;
  let assetInventory: StorageAssetInventoryService<object>;

  beforeEach(() => {
    storage = new MemoryStorage();
    assetCatalog = new MemoryStorageAssetService();
    assetInventory = new StorageAssetInventoryService({
      storage,
      assetCatalog,
    });
  });

  it('supports pure generation without storage dependencies', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
    });

    const output = await service.generate({
      prompt: 'hero product shot',
    });

    expect(output.model).toBe('fake-model');
    expect(output.image.mimeType).toBe('image/png');
    await expect(
      service.generateAndStore({
        prompt: 'hero product shot',
      })
    ).rejects.toBeInstanceOf(ImageGenerationStorageUnavailableError);
  });

  it('can generate and store with raw storage only', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
      storage,
    });

    const result = await service.generateAndStore(
      {
        prompt: 'hero product shot',
      },
      {
        generationId: 'gen_raw',
      }
    );

    expect(result.original.id).toBe('gen_raw');
    expect(result.original.asset).toBeUndefined();
    expect(storage.objects.has('image-generations/gen_raw/original.png')).toBe(
      true
    );
    await expect(service.getGeneration('gen_raw')).rejects.toBeInstanceOf(
      ImageGenerationInventoryUnavailableError
    );
  });

  it('can compose its own inventory from storage and asset catalog', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
      storage,
      assetCatalog,
      variantProducers: createImageResizeVariantProducers(
        new FakeImageResizer(),
        [
          {
            name: 'thumb',
            width: 320,
            height: 320,
            format: 'webp',
          },
        ]
      ),
    });

    const result = await service.generateAndStore(
      {
        prompt: 'hero product shot',
      },
      {
        generationId: 'gen_composed',
      }
    );

    expect(result.original.asset?.id).toBe('gen_composed');
    expect(result.variants[0]?.asset?.parentAssetId).toBe('gen_composed');

    const stored = await service.getGeneration('gen_composed');
    expect(stored?.generationId).toBe('gen_composed');
    expect(stored?.preferredVariant?.id).toBe('gen_composed:thumb');
  });

  it('can generate variants in memory via resize helpers', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
      variantProducers: createImageResizeVariantProducers(
        new FakeImageResizer(),
        [
          {
            name: 'social',
            width: 1200,
            height: 630,
            format: 'webp',
            tags: ['social'],
          },
          {
            name: 'thumb',
            width: 320,
            height: 320,
            format: 'webp',
          },
        ]
      ),
    });

    const prepared = await service.generateWithVariants(
      {
        prompt: 'hero product shot',
      },
      {
        generationId: 'gen_prepared',
      }
    );

    expect(prepared.variants.map((variant) => variant.name)).toEqual([
      'social',
      'thumb',
    ]);
    expect(prepared.variants.map((variant) => variant.position)).toEqual([
      0, 1,
    ]);
    expect(prepared.variants[0]?.image.mimeType).toBe('image/webp');
  });

  it('persists originals and resized child variants through asset inventory', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
      assetInventory,
      variantProducers: createImageResizeVariantProducers(
        new FakeImageResizer(),
        [
          {
            name: 'social',
            width: 1200,
            height: 630,
            format: 'webp',
            tags: ['social'],
          },
          {
            name: 'thumb',
            width: 320,
            height: 320,
            format: 'webp',
          },
        ]
      ),
      buildOriginalExtraMeta: ({ generationId }) => ({
        generationId,
      }),
    });

    const result = await service.generateAndStore(
      {
        prompt: 'hero product shot',
        model: 'request-model',
      },
      {
        generationId: 'gen_123',
        tags: ['marketing'],
      }
    );

    expect(result.original.asset?.meta.role).toBe('original');
    expect(result.original.asset?.meta.kind).toBe('image-generation');
    expect(result.original.asset?.meta.extra).toEqual({
      generationId: 'gen_123',
    });
    expect(result.variants.map((variant) => variant.id)).toEqual([
      'gen_123:social',
      'gen_123:thumb',
    ]);
    expect(result.variants[0]?.asset?.meta.position).toBe(0);
    expect(result.variants[1]?.asset?.meta.position).toBe(1);
    expect(storage.objects.has('image-generations/gen_123/original.png')).toBe(
      true
    );
    expect(
      storage.objects.has('image-generations/gen_123/variants/00-social.webp')
    ).toBe(true);
    expect(
      storage.objects.has('image-generations/gen_123/variants/01-thumb.webp')
    ).toBe(true);
  });

  it('threads preview metadata builders into composed inventory writes', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
      storage,
      assetCatalog,
      previewMetadataBuilder: async ({ meta }) => {
        return {
          ...(meta ?? {}),
          preview: {
            kind: 'thumbhash',
            value: 'stub-hash',
            dataUrl: 'data:image/png;base64,stub',
            width: 32,
            height: 32,
            aspectRatio: 1,
          },
        } satisfies StorageAssetPreviewMeta;
      },
      variantProducers: createImageResizeVariantProducers(
        new FakeImageResizer(),
        [
          {
            name: 'thumb',
            width: 320,
            height: 320,
            format: 'webp',
          },
        ]
      ),
    });

    const result = await service.generateAndStore(
      {
        prompt: 'hero product shot',
      },
      {
        generationId: 'gen_preview',
      }
    );

    expect(result.original.asset?.meta.preview?.kind).toBe('thumbhash');
    expect(result.variants[0]?.asset?.meta.preview?.value).toBe('stub-hash');
  });

  it('hydrates history from inventory-backed generated roots only', async () => {
    const service = new ImageGenerationService({
      generator: new FakeImageGenerator(),
      assetInventory,
      variantProducers: createImageResizeVariantProducers(
        new FakeImageResizer(),
        [
          {
            name: 'thumb',
            width: 320,
            height: 320,
            format: 'webp',
          },
        ]
      ),
    });

    await service.generateAndStore(
      {
        prompt: 'product close-up',
      },
      {
        generationId: 'gen_a',
      }
    );

    await assetCatalog.create({
      id: 'upload_1',
      objectKey: 'uploads/upload_1/original.png',
      mimeType: 'image/png',
      source: 'uploaded',
      tags: [],
      meta: {
        kind: 'upload',
        provider: 'uploader',
        prompt: 'ignored',
        role: 'original',
      },
      createdAt: new Date('2026-03-19T08:00:00.000Z'),
      updatedAt: new Date('2026-03-19T08:00:00.000Z'),
    });

    await service.generateAndStore(
      {
        prompt: 'homepage illustration',
      },
      {
        generationId: 'gen_b',
      }
    );

    const stored = await service.getGeneration('gen_b');
    expect(stored?.generationId).toBe('gen_b');
    expect(stored?.preferredVariant?.id).toBe('gen_b:thumb');

    const history = await service.listHistory({
      limit: 1,
    });

    expect(history.items).toHaveLength(1);
    expect(history.items[0]?.generationId).toBe('gen_b');
    expect(history.items[0]?.preferredVariant?.id).toBe('gen_b:thumb');
    expect(history.nextCursor).toBeDefined();

    const secondPage = await service.listHistory({
      limit: 5,
      cursor: history.nextCursor,
    });

    expect(secondPage.items.map((item) => item.generationId)).toEqual([
      'gen_a',
    ]);
  });
});
