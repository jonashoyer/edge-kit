import { CustomError } from '../../utils/custom-error';

export type StorageUploadStatus = 'ISSUED' | 'UPLOADED' | 'CONSUMED' | 'PURGED';

export interface StorageUploadLedgerRecord<
  TMeta extends object = Record<string, unknown>,
> {
  id: string;
  tenantId: string | null;
  objectKey: string;
  mimeType: string;
  status: StorageUploadStatus;
  sizeBytes: number | null;
  etag: string | null;
  expiresAt: Date;
  issuedAt: Date;
  uploadedAt: Date | null;
  consumedAt: Date | null;
  purgedAt: Date | null;
  meta: TMeta;
}

export interface UpsertStorageUploadLedgerInput<
  TMeta extends object = Record<string, unknown>,
> {
  id: string;
  tenantId?: string | null;
  objectKey: string;
  mimeType: string;
  status: StorageUploadStatus;
  sizeBytes?: number | null;
  etag?: string | null;
  expiresAt: Date;
  issuedAt?: Date;
  uploadedAt?: Date | null;
  consumedAt?: Date | null;
  purgedAt?: Date | null;
  meta?: TMeta;
}

export interface UpdateStorageUploadLedgerInput<
  TMeta extends object = Record<string, unknown>,
> {
  tenantId?: string | null;
  objectKey?: string;
  mimeType?: string;
  status?: StorageUploadStatus;
  sizeBytes?: number | null;
  etag?: string | null;
  expiresAt?: Date;
  issuedAt?: Date;
  uploadedAt?: Date | null;
  consumedAt?: Date | null;
  purgedAt?: Date | null;
  meta?: TMeta;
}

export interface ListExpiredStorageUploadsOptions {
  expiresBefore?: Date;
  limit?: number;
  statuses?: StorageUploadStatus[];
  tenantId?: string | null;
}

const normalizeRequiredString = (value: string, label: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Storage upload ${label} must not be empty`);
  }

  return normalized;
};

const normalizeTenantId = (
  tenantId: string | null | undefined
): string | null => {
  if (tenantId === undefined || tenantId === null) {
    return null;
  }

  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : null;
};

export class StorageUploadLedgerNotFoundError extends CustomError<'NOT_FOUND'> {
  constructor(id: string) {
    super(`Storage upload not found: ${id}`, 'NOT_FOUND');
  }
}

export class StorageUploadAlreadyConsumedError extends CustomError<'CONFLICT'> {
  constructor(id: string) {
    super(`Storage upload already consumed: ${id}`, 'CONFLICT');
  }
}

export class StorageUploadLedgerServiceUnavailableError extends CustomError<'UNSUPPORTED'> {
  constructor() {
    super(
      'Storage uploads require an uploadLedger service to be configured',
      'UNSUPPORTED'
    );
  }
}

export abstract class AbstractStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
> {
  abstract get(id: string): Promise<StorageUploadLedgerRecord<TMeta> | null>;

  abstract listExpired(
    options?: ListExpiredStorageUploadsOptions
  ): Promise<StorageUploadLedgerRecord<TMeta>[]>;

  abstract upsert(
    input: UpsertStorageUploadLedgerInput<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>>;

  async update(
    id: string,
    patch: UpdateStorageUploadLedgerInput<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>> {
    const existing = await this.get(id);

    if (!existing) {
      throw new StorageUploadLedgerNotFoundError(id);
    }

    return await this.upsert({
      id,
      tenantId: patch.tenantId ?? existing.tenantId,
      objectKey: patch.objectKey ?? existing.objectKey,
      mimeType: patch.mimeType ?? existing.mimeType,
      status: patch.status ?? existing.status,
      sizeBytes:
        patch.sizeBytes === undefined ? existing.sizeBytes : patch.sizeBytes,
      etag: patch.etag === undefined ? existing.etag : patch.etag,
      expiresAt: patch.expiresAt ?? existing.expiresAt,
      issuedAt: patch.issuedAt ?? existing.issuedAt,
      uploadedAt:
        patch.uploadedAt === undefined ? existing.uploadedAt : patch.uploadedAt,
      consumedAt:
        patch.consumedAt === undefined ? existing.consumedAt : patch.consumedAt,
      purgedAt:
        patch.purgedAt === undefined ? existing.purgedAt : patch.purgedAt,
      meta: patch.meta ?? existing.meta,
    });
  }

  async require(id: string): Promise<StorageUploadLedgerRecord<TMeta>> {
    const record = await this.get(id);

    if (!record) {
      throw new StorageUploadLedgerNotFoundError(id);
    }

    return record;
  }

  protected normalizeId(id: string): string {
    return normalizeRequiredString(id, 'id');
  }

  protected normalizeTenantId(
    tenantId: string | null | undefined
  ): string | null {
    return normalizeTenantId(tenantId);
  }
}
