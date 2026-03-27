# Feature: Storage Asset Catalog and Lifecycle

Status: Active
Last Reviewed: 2026-03-27
Related ADRs: [ADR-0010], [ADR-0016]

## Current State

`src/services/storage-asset/` provides a generic persistent asset catalog plus
the lifecycle primitives that sit between raw object storage and app-owned
domain objects.

The service family now includes:

- a generic `storage_asset` catalog with `orphanedAt` lifecycle state
- a `storage_asset_ref` attachment graph keyed by
  `(tenantId, ownerType, ownerId, assetId)`
- a `storage_upload_ledger` that tracks presigned upload issuance and
  finalization state
- a concrete `StorageAssetInventoryService` that orchestrates upload issuance,
  asset finalization, ref sync, orphan marking, and cleanup
- an optional preview metadata builder hook that can enrich inventory-backed
  image assets with ThumbHash previews without changing the catalog schema

The canonical asset shape tracks `objectKey`, `mimeType`, string `source`,
nullable `parentAssetId`, nullable `orphanedAt`, top-level `tags`, generic
`meta`, and creation/update timestamps. Family liveness is rooted at
`parentAssetId`: any active ref on any descendant keeps the full family live.

## Implementation Constraints

- Keep this separate from `src/services/storage/`; the storage family owns
  provider behavior, while this family owns inventory and metadata over stored
  objects.
- Keep `source` generic and app-defined.
- Keep `tags` and `meta` generic enough for uploads, generated assets,
  imports, OCR inputs, and other binary workflows.
- Model related assets through `parentAssetId`; do not hardcode image-only
  columns into the catalog.
- Keep upload lifecycle state in `storage-asset`; do not move DB-backed upload
  tracking into `AbstractStorage`.
- Keep refs and upload ledger as reusable companion services; app-specific
  owner validation and auth remain downstream concerns.
- Treat family-root liveness as the default. Do not add per-workflow liveness
  modes without a superseding ADR.

## Public API / Contracts

- `AbstractStorageAssetService`
- `ListOrphanedStorageAssetRootsOptions`
- `StorageAssetRecord`
- `UpsertStorageAssetInput`
- `StorageAssetListPageOptions`
- `StorageAssetListPageResult`
- `StorageAssetStillReferencedError`
- `StorageAssetFamilyConsistencyError`
- `AbstractStorageAssetRefService`
- `StorageAssetOwnerRef`
- `StorageAssetOwnerRefScope`
- `AbstractStorageUploadLedgerService`
- `StorageUploadLedgerRecord`
- `StorageUploadStatus`
- `StorageAssetInventoryService`
- `WriteStorageAssetInput`
- `ReadStorageAssetResult`
- `StorageAssetReadUrlResult`
- `ThumbHashPreview`
- `StorageAssetPreviewMeta`
- `StorageAssetPreviewMetadataBuilder`
- `StorageAssetPreviewMetadataBuilderContext`
- `createSharpThumbHashPreviewMetadataBuilder(...)`
- `DeleteStorageAssetOptions`
- `IssueStorageUploadInput`
- `IssuedStorageUploadResult`
- `MarkStorageUploadCompletedInput`
- `FinalizeStorageUploadInput`
- `FinalizedStorageUploadResult`
- `SyncStorageAssetRefsInput`
- `PurgeExpiredUploadsOptions`
- `PurgeOrphanedAssetsOptions`
- `DrizzleStorageAssetRefService(...)`
- `createMySqlStorageAssetRefTable(...)`
- `createPostgresStorageAssetRefTable(...)`
- `createSqliteStorageAssetRefTable(...)`
- `DrizzleStorageUploadLedgerService(...)`
- `createMySqlStorageUploadLedgerTable(...)`
- `createPostgresStorageUploadLedgerTable(...)`
- `createSqliteStorageUploadLedgerTable(...)`
- `DrizzleStorageAssetService(...)`
- `createMySqlStorageAssetTable(...)`
- `createPostgresStorageAssetTable(...)`
- `createSqliteStorageAssetTable(...)`

## What NOT To Do

- Do not store file bytes in this table or service family.
- Do not merge this API into `AbstractStorage`; compose `AbstractStorage`
  instead.
- Do not add workflow-specific metadata fields to the generic table shape.
- Do not add built-in schedulers or workers here; expose purge primitives and
  let the host app schedule them.
- Do not make asset consumers know whether a file came from a pending upload,
  a generated asset, or an import unless the caller explicitly models that in
  `source` or `meta`.
