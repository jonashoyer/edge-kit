import { CustomError } from '../../utils/custom-error';

export interface StorageAssetOwnerRef {
  assetId: string;
  ownerType: string;
  ownerId: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageAssetOwnerRefScope {
  ownerType: string;
  ownerId: string;
  tenantId?: string | null;
}

export interface UpsertStorageAssetOwnerRefInput
  extends StorageAssetOwnerRefScope {
  assetId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DeleteStorageAssetOwnerRefInput
  extends StorageAssetOwnerRefScope {
  assetId: string;
}

const normalizeRequiredString = (value: string, label: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Storage asset ref ${label} must not be empty`);
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

export class StorageAssetRefServiceUnavailableError extends CustomError<'UNSUPPORTED'> {
  constructor() {
    super(
      'Storage asset refs require an assetRefs service to be configured',
      'UNSUPPORTED'
    );
  }
}

export abstract class AbstractStorageAssetRefService {
  abstract listByOwner(
    scope: StorageAssetOwnerRefScope
  ): Promise<StorageAssetOwnerRef[]>;

  abstract listByAssetIds(assetIds: string[]): Promise<StorageAssetOwnerRef[]>;

  abstract upsert(
    input: UpsertStorageAssetOwnerRefInput
  ): Promise<StorageAssetOwnerRef>;

  abstract delete(input: DeleteStorageAssetOwnerRefInput): Promise<void>;

  abstract deleteByAssetIds(assetIds: string[]): Promise<void>;

  protected normalizeScope(
    scope: StorageAssetOwnerRefScope
  ): Required<StorageAssetOwnerRefScope> {
    return {
      ownerType: normalizeRequiredString(scope.ownerType, 'ownerType'),
      ownerId: normalizeRequiredString(scope.ownerId, 'ownerId'),
      tenantId: normalizeTenantId(scope.tenantId),
    };
  }

  protected normalizeAssetId(assetId: string): string {
    return normalizeRequiredString(assetId, 'assetId');
  }
}
