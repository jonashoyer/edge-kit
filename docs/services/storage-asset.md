# Storage Asset Catalog and Lifecycle

The `storage-asset` service family sits above `src/services/storage/`.
`storage` still owns bytes, metadata reads, and presigned URLs. `storage-asset`
owns reusable application-facing state over those stored objects:

- asset catalog rows
- owner attachment refs
- upload issuance and finalization state
- orphan marking and purge helpers

## Overview

Use this service family when you need more than "blob plus key":

- stable asset ids separate from object keys
- families of related assets via `parentAssetId`
- explicit knowledge of whether an asset is still attached to application state
- browser-direct or worker-issued uploads that must be finalized later
- time-based cleanup for abandoned uploads and orphaned asset families

## Catalog Shape

The reusable `storage_asset` shape now includes liveness state:

```ts
type StorageAssetRecord<TMeta = object> = {
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
};
```

`orphanedAt` is null while the asset family is live. It is set when the last
ref disappears and cleared if the family is reattached before purge.

## Companion Tables

### Asset refs

`storage_asset_ref` models attachment state generically:

```ts
type StorageAssetOwnerRef = {
  assetId: string;
  ownerType: string;
  ownerId: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

Use this when app code needs to say "this asset is attached to this owner".

### Upload ledger

`storage_upload_ledger` tracks uploads before they become cataloged assets:

```ts
type StorageUploadLedgerRecord<TMeta = object> = {
  id: string;
  tenantId: string | null;
  objectKey: string;
  mimeType: string;
  status: 'ISSUED' | 'UPLOADED' | 'CONSUMED' | 'PURGED';
  sizeBytes: number | null;
  etag: string | null;
  expiresAt: Date;
  issuedAt: Date;
  uploadedAt: Date | null;
  consumedAt: Date | null;
  purgedAt: Date | null;
  meta: TMeta;
};
```

Use this when object bytes may exist before an asset row does.

## Drizzle Helpers

Edge Kit ships portable Drizzle table builders for all supported SQL dialects:

- `createMySqlStorageAssetTable(...)`
- `createPostgresStorageAssetTable(...)`
- `createSqliteStorageAssetTable(...)`
- `createMySqlStorageAssetRefTable(...)`
- `createPostgresStorageAssetRefTable(...)`
- `createSqliteStorageAssetRefTable(...)`
- `createMySqlStorageUploadLedgerTable(...)`
- `createPostgresStorageUploadLedgerTable(...)`
- `createSqliteStorageUploadLedgerTable(...)`

You still own migrations in the host app.

## Contracts

The service family stays split by persistence concern:

- `AbstractStorageAssetService`
  the asset catalog
- `AbstractStorageAssetRefService`
  the owner-to-asset attachment graph
- `AbstractStorageUploadLedgerService`
  issued/finalized/purged upload state

`StorageAssetInventoryService` is the concrete orchestration layer that composes
those contracts with `AbstractStorage`.

## Inventory Lifecycle

`StorageAssetInventoryService` now supports four workflow groups:

- byte and catalog operations: `writeAsset`, `registerAsset`, `readAsset`,
  `deleteAsset`
- upload lifecycle: `issueUpload`, `markUploadCompleted`, `finalizeUpload`
- attachment lifecycle: `syncAssetRefs`, `attachAsset`, `detachAsset`
- cleanup: `purgeExpiredUploads`, `purgeOrphanedAssets`

Example:

```ts
import { StorageAssetInventoryService } from '../services/storage-asset/storage-asset-inventory';

const inventory = new StorageAssetInventoryService({
  storage,
  assetCatalog,
  assetRefs,
  uploadLedger,
  uploadKeyStrategy: ({ id }) => `uploads/${id}.png`,
});

const issued = await inventory.issueUpload({
  id: 'upload_123',
  tenantId: 'tenant_a',
  mimeType: 'image/png',
  meta: { flow: 'avatar' },
});

// client uploads bytes to issued.url

await inventory.markUploadCompleted('upload_123', {
  uploadedAt: new Date(),
});

const finalized = await inventory.finalizeUpload({
  uploadId: 'upload_123',
  assetId: 'asset_123',
  source: 'uploaded',
  meta: { kind: 'avatar' },
  syncRefs: {
    ownerType: 'profile',
    ownerId: 'user_123',
    tenantId: 'tenant_a',
    assetIds: ['asset_123'],
  },
});
```

## Family-root Liveness

Liveness is family-rooted, not row-local:

- standalone assets are one-node families
- `parentAssetId` descendants belong to the same family as their root
- any ref on any asset in the family keeps the whole family live
- when the last ref disappears, `orphanedAt` is set on every family member
- when a ref returns, `orphanedAt` is cleared on every family member

This avoids root/variant drift in workflows like original-plus-variants.

## Cleanup Model

Edge Kit does not ship a scheduler. Host apps call cleanup methods from their
own workers or cron jobs:

- `purgeExpiredUploads(...)`
  finds expired `ISSUED` and `UPLOADED` ledger rows, deletes any leftover
  object bytes, and marks those uploads `PURGED`
- `purgeOrphanedAssets(...)`
  finds root assets whose `orphanedAt` is older than a cutoff, rechecks refs,
  and deletes the full family when it is still unreferenced

## Best Practices

- Keep `source` small and app-owned.
- Put cross-workflow categories in `tags` and workflow-specific detail in
  `meta`.
- Treat `tenantId` as a ref/upload concern unless the host app truly needs
  tenant-specific asset rows.
- Use `syncAssetRefs(...)` with the current attachment set for an owner instead
  of trying to hand-roll per-row diff logic.
- Finalize browser-direct uploads through the upload ledger instead of writing
  custom "pending upload" tables in every app.
