# Feature: Storage Asset Catalog

Status: Active
Last Reviewed: 2026-03-21

## Current State

`src/services/storage-asset/` provides both a generic persistent asset catalog
and a concrete inventory middleware service that coordinates object-storage
bytes with catalog rows.

The canonical shape tracks `objectKey`, `mimeType`, string `source`,
 nullable `parentAssetId`, top-level `tags`, generic `meta`, and creation/update
 timestamps. The Drizzle adapter supports MySQL, PostgreSQL, and SQLite, while
 `StorageAssetInventoryService` composes `AbstractStorage` plus the catalog for
 write/read/delete inventory workflows.

## Implementation Constraints

- Keep this separate from `src/services/storage/`; the storage family owns
  provider behavior, while this family owns inventory and metadata over stored
  objects.
- Keep `source` generic and app-defined.
- Keep `tags` and `meta` generic enough for uploads, generated assets,
  imports, OCR inputs, and other binary workflows.
- Model related assets through `parentAssetId`; do not hardcode image-only
  columns into the catalog.

## Public API / Contracts

- `AbstractStorageAssetService`
- `StorageAssetRecord`
- `UpsertStorageAssetInput`
- `StorageAssetListPageOptions`
- `StorageAssetListPageResult`
- `StorageAssetInventoryService`
- `WriteStorageAssetInput`
- `ReadStorageAssetResult`
- `StorageAssetReadUrlResult`
- `DeleteStorageAssetOptions`
- `DrizzleStorageAssetService(...)`
- `createMySqlStorageAssetTable(...)`
- `createPostgresStorageAssetTable(...)`
- `createSqliteStorageAssetTable(...)`

## What NOT To Do

- Do not store file bytes in this table or service family.
- Do not merge this API into `AbstractStorage`; compose `AbstractStorage`
  instead.
- Do not add workflow-specific metadata fields to the generic table shape.
