import { CustomError } from '../../utils/custom-error';

export interface StorageAssetRecord<
  TMeta extends object = Record<string, unknown>,
> {
  id: string;
  objectKey: string;
  mimeType: string;
  source: string;
  parentAssetId: string | null;
  orphanedAt: Date | null;
  tags: string[];
  meta: TMeta;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertStorageAssetInput<
  TMeta extends object = Record<string, unknown>,
> {
  id: string;
  objectKey: string;
  mimeType: string;
  source: string;
  parentAssetId?: string | null;
  orphanedAt?: Date | null;
  tags?: string[];
  meta?: TMeta;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UpdateStorageAssetInput<
  TMeta extends object = Record<string, unknown>,
> {
  objectKey?: string;
  mimeType?: string;
  source?: string;
  parentAssetId?: string | null;
  orphanedAt?: Date | null;
  tags?: string[];
  meta?: TMeta;
  updatedAt?: Date;
}

export type StorageAssetListOrder = 'asc' | 'desc';

export interface StorageAssetListPageOptions {
  source?: string;
  parentAssetId?: string | null;
  limit?: number;
  cursor?: string;
  order?: StorageAssetListOrder;
}

export interface StorageAssetListPageResult<
  TMeta extends object = Record<string, unknown>,
> {
  items: StorageAssetRecord<TMeta>[];
  nextCursor?: string;
}

export interface ListOrphanedStorageAssetRootsOptions {
  olderThan?: Date;
  limit?: number;
}

type StorageAssetCursorPayload = {
  createdAt: number;
  id: string;
  order: StorageAssetListOrder;
};

const DEFAULT_CURSOR_ORDER = 'desc';

export class InvalidStorageAssetCursorError extends CustomError<'INVALID_CURSOR'> {
  constructor() {
    super('Invalid storage asset cursor', 'INVALID_CURSOR');
  }
}

export class StorageAssetAlreadyExistsError extends CustomError<'CONFLICT'> {
  constructor(id: string) {
    super(`Storage asset already exists: ${id}`, 'CONFLICT');
  }
}

export class StorageAssetNotFoundError extends CustomError<'NOT_FOUND'> {
  constructor(id: string) {
    super(`Storage asset not found: ${id}`, 'NOT_FOUND');
  }
}

export class StorageAssetStillReferencedError extends CustomError<'CONFLICT'> {
  constructor(id: string) {
    super(`Storage asset family is still referenced: ${id}`, 'CONFLICT');
  }
}

export class StorageAssetFamilyConsistencyError extends CustomError<'INVALID_STATE'> {
  constructor(id: string) {
    super(
      `Storage asset family is inconsistent for asset: ${id}`,
      'INVALID_STATE'
    );
  }
}

export const encodeStorageAssetCursor = (
  record: Pick<StorageAssetRecord, 'createdAt' | 'id'>,
  order: StorageAssetListOrder = DEFAULT_CURSOR_ORDER
): string => {
  const payload: StorageAssetCursorPayload = {
    createdAt: record.createdAt.getTime(),
    id: record.id,
    order,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

export const decodeStorageAssetCursor = (
  cursor: string
): StorageAssetCursorPayload => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as Partial<StorageAssetCursorPayload>;

    if (
      typeof decoded.createdAt !== 'number' ||
      !Number.isFinite(decoded.createdAt) ||
      typeof decoded.id !== 'string' ||
      decoded.id.trim().length === 0
    ) {
      throw new InvalidStorageAssetCursorError();
    }

    const order =
      decoded.order === 'asc' || decoded.order === 'desc'
        ? decoded.order
        : DEFAULT_CURSOR_ORDER;

    return {
      createdAt: decoded.createdAt,
      id: decoded.id,
      order,
    };
  } catch (error) {
    if (error instanceof InvalidStorageAssetCursorError) {
      throw error;
    }

    throw new InvalidStorageAssetCursorError();
  }
};

/**
 * Abstract contract for a persistent asset catalog.
 *
 * This service tracks metadata about blobs stored in object storage or another
 * external binary system. It intentionally does not store the bytes
 * themselves.
 */
export abstract class AbstractStorageAssetService<
  TMeta extends object = Record<string, unknown>,
> {
  abstract get(id: string): Promise<StorageAssetRecord<TMeta> | null>;

  abstract getMany(ids: string[]): Promise<StorageAssetRecord<TMeta>[]>;

  abstract listByParentIds(
    parentAssetIds: string[]
  ): Promise<StorageAssetRecord<TMeta>[]>;

  abstract listPage(
    options?: StorageAssetListPageOptions
  ): Promise<StorageAssetListPageResult<TMeta>>;

  abstract listOrphanedRoots(
    options?: ListOrphanedStorageAssetRootsOptions
  ): Promise<StorageAssetRecord<TMeta>[]>;

  abstract upsert(
    input: UpsertStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>>;

  abstract setOrphanedAt(ids: string[], orphanedAt: Date | null): Promise<void>;

  abstract resolveRoot(
    assetId: string
  ): Promise<StorageAssetRecord<TMeta> | null>;

  abstract delete(id: string): Promise<void>;

  async create(
    input: UpsertStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    const existing = await this.get(input.id);

    if (existing) {
      throw new StorageAssetAlreadyExistsError(input.id);
    }

    return await this.upsert(input);
  }

  async update(
    id: string,
    patch: UpdateStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    const existing = await this.get(id);

    if (!existing) {
      throw new StorageAssetNotFoundError(id);
    }

    return await this.upsert({
      id,
      objectKey: patch.objectKey ?? existing.objectKey,
      mimeType: patch.mimeType ?? existing.mimeType,
      source: patch.source ?? existing.source,
      parentAssetId:
        patch.parentAssetId === undefined
          ? existing.parentAssetId
          : patch.parentAssetId,
      orphanedAt:
        patch.orphanedAt === undefined ? existing.orphanedAt : patch.orphanedAt,
      tags: patch.tags ?? existing.tags,
      meta: patch.meta ?? existing.meta,
      createdAt: existing.createdAt,
      updatedAt: patch.updatedAt ?? new Date(),
    });
  }

  async listChildren(
    parentAssetId: string
  ): Promise<StorageAssetRecord<TMeta>[]> {
    return await this.listByParentIds([parentAssetId]);
  }
}
