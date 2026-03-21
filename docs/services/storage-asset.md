# Storage Asset Catalog

The `storage-asset` service family provides a generic metadata catalog plus a
 higher-level inventory middleware for files that live in object storage or
 another binary store. It remains a separate family from `src/services/storage/`,
 which stays focused on provider-level byte operations and presigning.

## Overview

The storage-asset catalog lets you:

- Track a stable asset id and object key separately
- Group related assets with `parentAssetId`
- Tag assets with top-level strings
- Store workflow-specific metadata in generic `meta`
- Write, read, and delete assets through one inventory-facing service
- Page root assets with a composite cursor
- Reuse one catalog for uploads, imports, generated files, and variants

## Canonical Shape

The reusable `storage_asset` structure includes:

```ts
type StorageAssetRecord<TMeta = object> = {
  id: string;
  objectKey: string;
  mimeType: string;
  source: string;
  parentAssetId: string | null;
  tags: string[];
  meta: TMeta;
  createdAt: Date;
  updatedAt: Date;
};
```

## Table Helpers

Edge Kit ships Drizzle table builders for all supported SQL dialects:

- `createMySqlStorageAssetTable(...)`
- `createPostgresStorageAssetTable(...)`
- `createSqliteStorageAssetTable(...)`

Example:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

import {
  createSqliteStorageAssetTable,
  DrizzleStorageAssetService,
} from '../services/storage-asset/drizzle-storage-asset';

const sqlite = new Database('app.db');
const db = drizzle(sqlite);
const storageAssetTable = createSqliteStorageAssetTable<{
  kind?: string;
  checksum?: string;
}>('storage_asset');

const assetCatalog = DrizzleStorageAssetService(db, storageAssetTable);
```

You still own migrations in your host app. The helper functions give you a
 portable table definition and consistent field names.

## Service Contract

`AbstractStorageAssetService` defines the reusable catalog API:

```ts
abstract class AbstractStorageAssetService<TMeta = object> {
  abstract get(id: string): Promise<StorageAssetRecord<TMeta> | null>;
  abstract getMany(ids: string[]): Promise<StorageAssetRecord<TMeta>[]>;
  abstract listByParentIds(
    parentAssetIds: string[]
  ): Promise<StorageAssetRecord<TMeta>[]>;
  abstract listPage(
    options?: {
      source?: string;
      parentAssetId?: string | null;
      limit?: number;
      cursor?: string;
      order?: 'asc' | 'desc';
    }
  ): Promise<{
    items: StorageAssetRecord<TMeta>[];
    nextCursor?: string;
  }>;
  abstract upsert(
    input: UpsertStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>>;
  abstract delete(id: string): Promise<void>;
}
```

## Inventory Middleware

`StorageAssetInventoryService` composes `AbstractStorage` with the catalog so
 app code can work in asset ids instead of raw object keys when it wants the
 bytes and the inventory to move together. Unlike the catalog layer, this is a
 concrete composition service rather than a separate abstract contract.

```ts
import { StorageAssetInventoryService } from '../services/storage-asset/storage-asset-inventory';

const assetInventory = new StorageAssetInventoryService({
  storage,
  assetCatalog,
});

await assetInventory.writeAsset({
  id: 'asset_123',
  objectKey: 'generated/asset_123/original.png',
  mimeType: 'image/png',
  source: 'generated',
  data: fileBytes,
  tags: ['hero'],
  meta: {
    kind: 'image-generation',
    role: 'original',
  },
});

const read = await assetInventory.readAsset('asset_123');
await assetInventory.deleteAsset('asset_123');
```

## Usage Pattern

```ts
const original = await assetInventory.writeAsset({
  id: 'asset_123',
  objectKey: 'generated/asset_123/original.png',
  mimeType: 'image/png',
  source: 'generated',
  data: fileBytes,
  tags: ['hero'],
  meta: {
    kind: 'image-generation',
    role: 'original',
  },
});

await assetInventory.writeAsset({
  id: 'asset_123:thumb',
  objectKey: 'generated/asset_123/variants/thumb.webp',
  mimeType: 'image/webp',
  source: 'generated',
  parentAssetId: original.id,
  data: thumbBytes,
  tags: ['hero', 'thumb'],
  meta: {
    kind: 'image-generation',
    role: 'variant',
    position: 0,
  },
});

const roots = await assetInventory.listPage({
  source: 'generated',
  parentAssetId: null,
  limit: 20,
});
```

## Best Practices

- Keep the `source` vocabulary small and app-owned.
- Put cross-workflow semantics in `tags` and workflow-specific detail in
  `meta`.
- Use `parentAssetId` for families such as original plus variants.
- Use `StorageAssetInventoryService` when app code wants bytes and inventory
  updates coordinated in one place.
- Use `registerAsset(...)` after browser-direct uploads or import jobs when the
  object already exists and only the inventory row needs to be finalized.
