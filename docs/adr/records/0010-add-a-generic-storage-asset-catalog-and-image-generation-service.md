# [0010] Add a generic storage-asset catalog and image-generation service

**Status:** `Implemented`

**Date:** 2026-03-19

---

## TL;DR

Edge Kit now adds a dedicated `storage-asset` service family for generic
 database-backed asset metadata catalogs plus inventory middleware over object
 storage, and an `image-generation` service family for provider-agnostic image
 generation orchestration that supports pure generation, optional object
 storage persistence, and optional persistence through that inventory layer.

---

## Decision

`src/services/storage-asset/` is introduced as a standalone service family
 rather than an extension of `src/services/storage/`. The storage service
 family remains responsible for bytes, presigned URLs, and provider-specific
 object-storage behavior. The new storage-asset family owns metadata records
 such as `objectKey`, `mimeType`, `source`, `parentAssetId`, `tags`, and
 generic `meta`, and now also owns the inventory middleware that coordinates
 object-storage writes and deletes with those rows.

The canonical reusable structure is a `storage_asset` table shape with:

- `id`
- `objectKey`
- `mimeType`
- `source`
- `parentAssetId`
- `tags`
- `meta`
- `createdAt`
- `updatedAt`

The Drizzle adapter supports MySQL, PostgreSQL, and SQLite and provides
 paginated root/child listing plus idempotent upsert behavior.

`src/services/image-generation/` is introduced as a separate orchestration
layer on top of a provider contract plus optional storage dependencies. It can
generate one original image per request without persistence, persist the
original and derived variants to object storage when storage is present, and
persist them as root and child assets when inventory is present. It also
exposes a history projection over generated root assets. Queueing, retries,
and provider-specific rate policies stay outside the toolkit service.

### Alternatives Considered

- **Add DB-backed catalog behavior to `storage/`:** Rejected because the
  existing storage feature explicitly stays focused on bytes and provider
  access.
- **Bake image-specific columns into the catalog:** Rejected because the asset
  catalog must remain reusable for uploads, imports, OCR sources, and other
  binary workflows.
- **Make image generation provider-specific:** Rejected because the toolkit
  should provide orchestration primitives, not lock callers to one vendor or
  queue runtime.

---

## Constraints

- Keep storage bytes and metadata catalog concerns in separate service
  families, but provide a composition layer for inventory workflows.
- Keep `source` as a generic string rather than an enum locked to one app.
- Keep `tags` and `meta` generic and top-level so callers can shape them per
  workflow.
- Model asset families through `parentAssetId` instead of hardcoded image
  variant columns.
- Keep image generation queue-agnostic and provider-agnostic.
- Keep image generation usable without forcing storage or catalog wiring.
- Let image variants come from pluggable producers instead of bundling a
  resizing library into Edge Kit.

---

## Consequences

Positive: Edge Kit now has a reusable metadata catalog for stored assets and a
 reusable inventory manager plus image-generation orchestration layer that can
 run in pure-generation, storage-only, or inventory-backed modes and can plug
 into app-owned workers, queues, and storage providers.

Negative: Callers now own migrations for the asset catalog table and must wire
 a provider plus optional variant producers explicitly.

Observed tradeoff: the image-generation history projection filters by
 `source` and `meta.kind` in service code rather than requiring cross-dialect
 JSON query support in the generic asset catalog.

Tech debt deferred or created: variant image transformation implementations and
 transactional rollback across storage and DB writes remain app-level concerns.

---

## User Flow / Public API / Contract Changes

### Storage Asset Catalog

New public surface under `src/services/storage-asset/`:

- `AbstractStorageAssetService`
- `AbstractStorageAssetInventoryService`
- `StorageAssetRecord`
- `UpsertStorageAssetInput`
- `StorageAssetListPageOptions`
- `StorageAssetListPageResult`
- `StorageAssetInventoryService`
- `DrizzleStorageAssetService(...)`
- `createMySqlStorageAssetTable(...)`
- `createPostgresStorageAssetTable(...)`
- `createSqliteStorageAssetTable(...)`

### Image Generation

New public surface under `src/services/image-generation/`:

- `AbstractImageGenerator`
- `ImageGenerationRequest`
- `ImageGenerationOutput`
- `ImageGenerationService`
- `ImageGenerationVariantProducer`
- `ImageGenerationOriginalAssetMeta`
- `ImageGenerationVariantAssetMeta`

---

## Related ADRs

- ADR-0002 — Add contextualizer, richer storage, and AI runtime support
