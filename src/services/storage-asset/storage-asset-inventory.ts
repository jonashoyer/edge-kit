import type {
  AbstractStorage,
  StorageBody,
  StorageWriteOptions,
} from '../storage/abstract-storage';
import {
  type AbstractStorageAssetService,
  type StorageAssetListPageOptions,
  type StorageAssetListPageResult,
  StorageAssetNotFoundError,
  type StorageAssetRecord,
  type UpsertStorageAssetInput,
} from './abstract-storage-asset';

export interface WriteStorageAssetInput<
  TMeta extends object = Record<string, unknown>,
> extends UpsertStorageAssetInput<TMeta> {
  data: StorageBody;
  storageWriteOptions?: StorageWriteOptions;
}

export interface DeleteStorageAssetOptions {
  cascade?: boolean;
  ignoreMissing?: boolean;
}

export interface ReadStorageAssetResult<
  TMeta extends object = Record<string, unknown>,
> {
  asset: StorageAssetRecord<TMeta>;
  body: Buffer;
}

export interface StorageAssetReadUrlResult<
  TMeta extends object = Record<string, unknown>,
> {
  asset: StorageAssetRecord<TMeta>;
  url: string;
  expiresAt: number;
}

export interface StorageAssetInventoryServiceOptions<
  TMeta extends object = Record<string, unknown>,
> {
  storage: AbstractStorage;
  assetCatalog: AbstractStorageAssetService<TMeta>;
}

const normalizeStorageWriteOptions = <
  TMeta extends object = Record<string, unknown>,
>(
  input: WriteStorageAssetInput<TMeta>
) => {
  return {
    ...input.storageWriteOptions,
    contentType: input.storageWriteOptions?.contentType ?? input.mimeType,
  };
};

export class StorageAssetInventoryService<
  TMeta extends object = Record<string, unknown>,
> {
  readonly storage: AbstractStorage;
  readonly assetCatalog: AbstractStorageAssetService<TMeta>;

  constructor(options: StorageAssetInventoryServiceOptions<TMeta>) {
    this.storage = options.storage;
    this.assetCatalog = options.assetCatalog;
  }

  async get(id: string): Promise<StorageAssetRecord<TMeta> | null> {
    return await this.assetCatalog.get(id);
  }

  async getMany(ids: string[]): Promise<StorageAssetRecord<TMeta>[]> {
    return await this.assetCatalog.getMany(ids);
  }

  async listChildren(
    parentAssetId: string
  ): Promise<StorageAssetRecord<TMeta>[]> {
    return await this.assetCatalog.listChildren(parentAssetId);
  }

  async listByParentIds(
    parentAssetIds: string[]
  ): Promise<StorageAssetRecord<TMeta>[]> {
    return await this.assetCatalog.listByParentIds(parentAssetIds);
  }

  async listPage(
    options?: StorageAssetListPageOptions
  ): Promise<StorageAssetListPageResult<TMeta>> {
    return await this.assetCatalog.listPage(options);
  }

  async registerAsset(
    input: UpsertStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    return await this.assetCatalog.upsert(input);
  }

  async writeAsset(
    input: WriteStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    await this.storage.write(
      input.objectKey,
      input.data,
      normalizeStorageWriteOptions(input)
    );

    return await this.registerAsset({
      id: input.id,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId,
      tags: input.tags,
      meta: input.meta,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
  }

  async readAsset(id: string): Promise<ReadStorageAssetResult<TMeta>> {
    const asset = await this.require(id);
    const body = await this.storage.read(asset.objectKey);

    return {
      asset,
      body,
    };
  }

  async createReadAssetPresignedUrl(
    id: string
  ): Promise<StorageAssetReadUrlResult<TMeta>> {
    const asset = await this.require(id);
    const { url, expiresAt } = await this.storage.createReadPresignedUrl(
      asset.objectKey
    );

    return {
      asset,
      url,
      expiresAt,
    };
  }

  async deleteAsset(
    id: string,
    options: DeleteStorageAssetOptions = {}
  ): Promise<void> {
    const batch = await this.resolveDeleteBatch(id, options.cascade ?? false);

    if (batch.length === 0) {
      if (options.ignoreMissing) {
        return;
      }

      throw new StorageAssetNotFoundError(id);
    }

    await this.storage.deleteMany(batch.map((asset) => asset.objectKey));

    for (const asset of [...batch].reverse()) {
      await this.assetCatalog.delete(asset.id);
    }
  }

  async exists(id: string): Promise<boolean> {
    return (await this.get(id)) !== null;
  }

  async require(id: string): Promise<StorageAssetRecord<TMeta>> {
    const asset = await this.get(id);

    if (!asset) {
      throw new StorageAssetNotFoundError(id);
    }

    return asset;
  }

  async readAssetBody(id: string): Promise<Buffer> {
    const result = await this.readAsset(id);
    return result.body;
  }

  private async resolveDeleteBatch(
    id: string,
    cascade: boolean
  ): Promise<StorageAssetRecord<TMeta>[]> {
    const root = await this.get(id);

    if (!root) {
      return [];
    }

    if (!cascade) {
      return [root];
    }

    const assets = [root];
    const queue = [root.id];

    while (queue.length > 0) {
      const parentIds = [...queue];
      queue.length = 0;

      const children = await this.assetCatalog.listByParentIds(parentIds);

      for (const child of children) {
        assets.push(child);
        queue.push(child.id);
      }
    }

    return assets;
  }
}
