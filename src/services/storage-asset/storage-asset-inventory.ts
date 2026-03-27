import type {
  AbstractStorage,
  StorageBody,
  StorageWriteOptions,
} from '../storage/abstract-storage';
import { storageBodyToUint8Array } from '../storage/abstract-storage';
import {
  type AbstractStorageAssetService,
  type StorageAssetListPageOptions,
  type StorageAssetListPageResult,
  StorageAssetNotFoundError,
  type StorageAssetRecord,
  StorageAssetStillReferencedError,
  type UpsertStorageAssetInput,
} from './abstract-storage-asset';
import {
  type AbstractStorageAssetRefService,
  type StorageAssetOwnerRef,
  type StorageAssetOwnerRefScope,
  StorageAssetRefServiceUnavailableError,
} from './abstract-storage-asset-ref';
import {
  type AbstractStorageUploadLedgerService,
  StorageUploadAlreadyConsumedError,
  type StorageUploadLedgerRecord,
  StorageUploadLedgerServiceUnavailableError,
} from './abstract-storage-upload-ledger';
import type {
  StorageAssetPreviewMetadataBuilder,
  StorageAssetPreviewMetadataBuilderContext,
} from './storage-asset-preview';

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

export interface StorageAssetOwnerRefInput extends StorageAssetOwnerRefScope {
  assetId: string;
}

export interface SyncStorageAssetRefsInput extends StorageAssetOwnerRefScope {
  assetIds: string[];
}

export interface IssueStorageUploadInput<
  TUploadMeta extends object = Record<string, unknown>,
> {
  id: string;
  tenantId?: string | null;
  objectKey?: string;
  mimeType: string;
  maxBytes?: number;
  minBytes?: number;
  meta?: TUploadMeta;
}

export interface MarkStorageUploadCompletedInput<
  TUploadMeta extends object = Record<string, unknown>,
> {
  sizeBytes?: number | null;
  etag?: string | null;
  uploadedAt?: Date;
  meta?: TUploadMeta;
}

export interface FinalizeStorageUploadInput<
  TMeta extends object = Record<string, unknown>,
> extends Omit<
    UpsertStorageAssetInput<TMeta>,
    'id' | 'objectKey' | 'mimeType'
  > {
  uploadId: string;
  assetId: string;
  syncRefs?: SyncStorageAssetRefsInput;
}

export interface IssuedStorageUploadResult<
  TUploadMeta extends object = Record<string, unknown>,
> {
  upload: StorageUploadLedgerRecord<TUploadMeta>;
  url: string;
  fields?: Record<string, string>;
  method: 'POST' | 'PUT';
  expiresAt: number;
}

export interface FinalizedStorageUploadResult<
  TMeta extends object = Record<string, unknown>,
  TUploadMeta extends object = Record<string, unknown>,
> {
  asset: StorageAssetRecord<TMeta>;
  upload: StorageUploadLedgerRecord<TUploadMeta>;
}

export interface PurgeExpiredUploadsOptions {
  expiresBefore?: Date;
  limit?: number;
  tenantId?: string | null;
}

export interface PurgeOrphanedAssetsOptions {
  olderThan?: Date;
  limit?: number;
}

export type StorageUploadKeyStrategy<
  TUploadMeta extends object = Record<string, unknown>,
> = (input: IssueStorageUploadInput<TUploadMeta>) => Promise<string> | string;

export interface StorageAssetInventoryServiceOptions<
  TMeta extends object = Record<string, unknown>,
  TUploadMeta extends object = Record<string, unknown>,
> {
  storage: AbstractStorage;
  assetCatalog: AbstractStorageAssetService<TMeta>;
  assetRefs?: AbstractStorageAssetRefService;
  uploadLedger?: AbstractStorageUploadLedgerService<TUploadMeta>;
  uploadKeyStrategy?: StorageUploadKeyStrategy<TUploadMeta>;
  previewMetadataBuilder?: StorageAssetPreviewMetadataBuilder<TMeta>;
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

const normalizeRequiredString = (value: string, label: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Storage asset inventory ${label} must not be empty`);
  }

  return normalized;
};

const normalizeAssetIds = (assetIds: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const assetId of assetIds) {
    const value = normalizeRequiredString(assetId, 'assetId');

    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
};

const mergeMeta = <TMeta extends object>(
  current: TMeta,
  next: TMeta | undefined
): TMeta => {
  if (!next) {
    return current;
  }

  return {
    ...current,
    ...next,
  };
};

const isPreviewableMimeType = (mimeType: string): boolean => {
  return mimeType.toLowerCase().startsWith('image/');
};

type ResolvePreviewMetadataInput<
  TMeta extends object = Record<string, unknown>,
> = Omit<StorageAssetPreviewMetadataBuilderContext<TMeta>, 'data'> & {
  data: () => Promise<Uint8Array>;
};

export class StorageAssetInventoryService<
  TMeta extends object = Record<string, unknown>,
  TUploadMeta extends object = Record<string, unknown>,
> {
  readonly storage: AbstractStorage;
  readonly assetCatalog: AbstractStorageAssetService<TMeta>;
  readonly assetRefs?: AbstractStorageAssetRefService;
  readonly uploadLedger?: AbstractStorageUploadLedgerService<TUploadMeta>;
  readonly uploadKeyStrategy?: StorageUploadKeyStrategy<TUploadMeta>;
  readonly previewMetadataBuilder?: StorageAssetPreviewMetadataBuilder<TMeta>;

  constructor(
    options: StorageAssetInventoryServiceOptions<TMeta, TUploadMeta>
  ) {
    this.storage = options.storage;
    this.assetCatalog = options.assetCatalog;
    this.assetRefs = options.assetRefs;
    this.uploadLedger = options.uploadLedger;
    this.uploadKeyStrategy = options.uploadKeyStrategy;
    this.previewMetadataBuilder = options.previewMetadataBuilder;
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
    const meta = await this.resolvePreviewMetadata({
      id: input.id,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId ?? null,
      tags: input.tags ?? [],
      meta: input.meta,
      data: async () => await storageBodyToUint8Array(input.data),
    });

    return await this.registerAsset({
      id: input.id,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId,
      orphanedAt: input.orphanedAt,
      tags: input.tags,
      meta,
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

  async issueUpload(
    input: IssueStorageUploadInput<TUploadMeta>
  ): Promise<IssuedStorageUploadResult<TUploadMeta>> {
    const uploadLedger = this.requireUploadLedger();
    const existing = await uploadLedger.get(input.id);

    if (existing) {
      if (existing.status === 'CONSUMED') {
        throw new StorageUploadAlreadyConsumedError(input.id);
      }

      if (existing.status === 'PURGED') {
        throw new Error(`Storage upload already purged: ${input.id}`);
      }

      if (existing.status === 'UPLOADED') {
        throw new Error(`Storage upload already completed: ${input.id}`);
      }
    }

    const objectKey =
      existing?.objectKey ?? (await this.resolveUploadObjectKey(input));
    const mimeType = existing?.mimeType ?? input.mimeType;
    const presigned = await this.storage.createWritePresignedUrl(objectKey, {
      contentType: mimeType,
      maxBytes: input.maxBytes,
      minBytes: input.minBytes,
    });
    const upload = await uploadLedger.upsert({
      id: input.id,
      tenantId: existing?.tenantId ?? input.tenantId,
      objectKey,
      mimeType,
      status: 'ISSUED',
      sizeBytes: null,
      etag: null,
      expiresAt: new Date(presigned.expiresAt),
      issuedAt: new Date(),
      meta: existing ? mergeMeta(existing.meta, input.meta) : input.meta,
      uploadedAt: null,
      consumedAt: null,
      purgedAt: null,
    });

    return {
      upload,
      ...presigned,
    };
  }

  async markUploadCompleted(
    uploadId: string,
    input: MarkStorageUploadCompletedInput<TUploadMeta> = {}
  ): Promise<StorageUploadLedgerRecord<TUploadMeta>> {
    const uploadLedger = this.requireUploadLedger();
    const existing = await uploadLedger.require(uploadId);

    if (existing.status === 'CONSUMED') {
      throw new StorageUploadAlreadyConsumedError(uploadId);
    }

    if (existing.status === 'PURGED') {
      throw new Error(`Storage upload already purged: ${uploadId}`);
    }

    return await uploadLedger.update(uploadId, {
      status: 'UPLOADED',
      sizeBytes: input.sizeBytes ?? existing.sizeBytes,
      etag: input.etag ?? existing.etag,
      uploadedAt: input.uploadedAt ?? new Date(),
      meta: mergeMeta(existing.meta, input.meta),
    });
  }

  async finalizeUpload(
    input: FinalizeStorageUploadInput<TMeta>
  ): Promise<FinalizedStorageUploadResult<TMeta, TUploadMeta>> {
    const uploadLedger = this.requireUploadLedger();
    const upload = await uploadLedger.require(input.uploadId);

    if (upload.status === 'CONSUMED') {
      throw new StorageUploadAlreadyConsumedError(input.uploadId);
    }

    if (upload.status === 'PURGED') {
      throw new Error(`Storage upload already purged: ${input.uploadId}`);
    }

    if (upload.status !== 'UPLOADED') {
      throw new Error(
        `Storage upload must be marked uploaded before finalization: ${input.uploadId}`
      );
    }

    if (upload.expiresAt.getTime() < Date.now()) {
      throw new Error(`Storage upload expired: ${input.uploadId}`);
    }

    const metadata = await this.storage.objectMetadata(upload.objectKey);
    const mimeType =
      upload.mimeType || metadata.contentType || 'application/octet-stream';
    const meta = await this.resolvePreviewMetadata({
      id: input.assetId,
      objectKey: upload.objectKey,
      mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId ?? null,
      tags: input.tags ?? [],
      meta: input.meta,
      data: async () =>
        new Uint8Array(await this.storage.read(upload.objectKey)),
    });
    await this.registerAsset({
      id: input.assetId,
      objectKey: upload.objectKey,
      mimeType,
      source: input.source,
      parentAssetId: input.parentAssetId,
      orphanedAt: new Date(),
      tags: input.tags,
      meta,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });

    if (input.syncRefs) {
      await this.syncAssetRefs(input.syncRefs);
    }

    const asset = await this.require(input.assetId);

    const consumedUpload = await uploadLedger.update(input.uploadId, {
      status: 'CONSUMED',
      sizeBytes: metadata.contentLength,
      etag: metadata.etag ?? upload.etag,
      uploadedAt: upload.uploadedAt ?? new Date(),
      consumedAt: new Date(),
      purgedAt: null,
    });

    return {
      asset,
      upload: consumedUpload,
    };
  }

  async syncAssetRefs(
    input: SyncStorageAssetRefsInput
  ): Promise<StorageAssetOwnerRef[]> {
    const assetRefs = this.requireAssetRefs();
    const desiredAssetIds = normalizeAssetIds(input.assetIds);

    await this.assertAssetsExist(desiredAssetIds);

    const existingRefs = await assetRefs.listByOwner(input);
    const existingIds = new Set(existingRefs.map((ref) => ref.assetId));
    const desiredIds = new Set(desiredAssetIds);

    for (const assetId of desiredAssetIds) {
      if (!existingIds.has(assetId)) {
        await assetRefs.upsert({
          assetId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          tenantId: input.tenantId,
        });
      }
    }

    for (const ref of existingRefs) {
      if (!desiredIds.has(ref.assetId)) {
        await assetRefs.delete({
          assetId: ref.assetId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          tenantId: input.tenantId,
        });
      }
    }

    await this.reconcileFamilies([...existingIds, ...desiredIds]);

    return await assetRefs.listByOwner(input);
  }

  async attachAsset(
    input: StorageAssetOwnerRefInput
  ): Promise<StorageAssetOwnerRef> {
    const assetRefs = this.requireAssetRefs();
    await this.require(input.assetId);

    const ref = await assetRefs.upsert({
      assetId: input.assetId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      tenantId: input.tenantId,
    });

    await this.reconcileFamilies([input.assetId]);

    return ref;
  }

  private async resolvePreviewMetadata(
    context: ResolvePreviewMetadataInput<TMeta>
  ): Promise<TMeta | undefined> {
    const previewMetadataBuilder = this.previewMetadataBuilder;

    if (
      !(previewMetadataBuilder && this.shouldBuildPreview(context.mimeType))
    ) {
      return context.meta;
    }

    try {
      const data = await context.data();
      return (
        (await previewMetadataBuilder({
          ...context,
          data,
        })) ?? context.meta
      );
    } catch {
      return context.meta;
    }
  }

  private shouldBuildPreview(mimeType: string): boolean {
    return (
      this.previewMetadataBuilder !== undefined &&
      isPreviewableMimeType(mimeType)
    );
  }

  async detachAsset(input: StorageAssetOwnerRefInput): Promise<void> {
    const assetRefs = this.requireAssetRefs();

    await assetRefs.delete({
      assetId: input.assetId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      tenantId: input.tenantId,
    });

    await this.reconcileFamilies([input.assetId], {
      skipMissingAssets: true,
    });
  }

  async purgeExpiredUploads(
    options: PurgeExpiredUploadsOptions = {}
  ): Promise<StorageUploadLedgerRecord<TUploadMeta>[]> {
    const uploadLedger = this.requireUploadLedger();
    const uploads = await uploadLedger.listExpired({
      expiresBefore: options.expiresBefore,
      limit: options.limit,
      tenantId: options.tenantId,
    });

    for (const upload of uploads) {
      if (await this.storage.exists(upload.objectKey)) {
        await this.storage.delete(upload.objectKey);
      }

      await uploadLedger.update(upload.id, {
        status: 'PURGED',
        purgedAt: new Date(),
      });
    }

    return uploads;
  }

  async purgeOrphanedAssets(
    options: PurgeOrphanedAssetsOptions = {}
  ): Promise<StorageAssetRecord<TMeta>[]> {
    const roots = await this.assetCatalog.listOrphanedRoots({
      olderThan: options.olderThan,
      limit: options.limit,
    });
    const purgedRoots: StorageAssetRecord<TMeta>[] = [];

    for (const root of roots) {
      const family = await this.resolveAssetFamily(root.id);
      const familyIds = family.map((asset) => asset.id);

      if (this.assetRefs) {
        const refs = await this.assetRefs.listByAssetIds(familyIds);

        if (refs.length > 0) {
          await this.assetCatalog.setOrphanedAt(familyIds, null);
          continue;
        }
      }

      await this.storage.deleteMany(family.map((asset) => asset.objectKey));

      if (this.assetRefs) {
        await this.assetRefs.deleteByAssetIds(familyIds);
      }

      for (const asset of [...family].reverse()) {
        await this.assetCatalog.delete(asset.id);
      }

      purgedRoots.push(root);
    }

    return purgedRoots;
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

    if (this.assetRefs) {
      const root = await this.assetCatalog.resolveRoot(id);

      if (!root) {
        throw new StorageAssetNotFoundError(id);
      }

      const family = await this.resolveAssetFamily(root.id);
      const refs = await this.assetRefs.listByAssetIds(
        family.map((asset) => asset.id)
      );

      if (refs.length > 0) {
        throw new StorageAssetStillReferencedError(id);
      }
    }

    await this.storage.deleteMany(batch.map((asset) => asset.objectKey));

    if (this.assetRefs) {
      await this.assetRefs.deleteByAssetIds(batch.map((asset) => asset.id));
    }

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

  private requireAssetRefs(): AbstractStorageAssetRefService {
    if (!this.assetRefs) {
      throw new StorageAssetRefServiceUnavailableError();
    }

    return this.assetRefs;
  }

  private requireUploadLedger(): AbstractStorageUploadLedgerService<TUploadMeta> {
    if (!this.uploadLedger) {
      throw new StorageUploadLedgerServiceUnavailableError();
    }

    return this.uploadLedger;
  }

  private async resolveUploadObjectKey(
    input: IssueStorageUploadInput<TUploadMeta>
  ): Promise<string> {
    if (input.objectKey) {
      return normalizeRequiredString(input.objectKey, 'objectKey');
    }

    if (!this.uploadKeyStrategy) {
      throw new Error(
        'Storage upload objectKey is required when no key strategy is configured'
      );
    }

    return normalizeRequiredString(
      await this.uploadKeyStrategy(input),
      'objectKey'
    );
  }

  private async assertAssetsExist(assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    const assets = await this.assetCatalog.getMany(assetIds);
    const foundIds = new Set(assets.map((asset) => asset.id));

    for (const assetId of assetIds) {
      if (!foundIds.has(assetId)) {
        throw new StorageAssetNotFoundError(assetId);
      }
    }
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

    return await this.resolveAssetFamily(root.id);
  }

  private async resolveAssetFamily(
    rootId: string
  ): Promise<StorageAssetRecord<TMeta>[]> {
    const root = await this.require(rootId);
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

  private async reconcileFamilies(
    assetIds: Iterable<string>,
    options: { skipMissingAssets?: boolean } = {}
  ): Promise<void> {
    if (!this.assetRefs) {
      return;
    }

    const rootIds = new Set<string>();

    for (const rawAssetId of assetIds) {
      const assetId = normalizeRequiredString(rawAssetId, 'assetId');
      const root = await this.assetCatalog.resolveRoot(assetId);

      if (!root) {
        if (options.skipMissingAssets) {
          continue;
        }

        throw new StorageAssetNotFoundError(assetId);
      }

      rootIds.add(root.id);
    }

    for (const rootId of rootIds) {
      const family = await this.resolveAssetFamily(rootId);
      const familyIds = family.map((asset) => asset.id);
      const refs = await this.assetRefs.listByAssetIds(familyIds);
      await this.assetCatalog.setOrphanedAt(
        familyIds,
        refs.length > 0 ? null : new Date()
      );
    }
  }
}
