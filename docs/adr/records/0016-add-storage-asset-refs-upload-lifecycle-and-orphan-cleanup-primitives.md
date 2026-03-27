# [0016] Add storage asset refs, upload lifecycle, and orphan cleanup primitives

**Status:** `Implemented`

**Date:** 2026-03-26

---

## TL;DR

Edge Kit extends `src/services/storage-asset/` with three reusable lifecycle
primitives over stored objects: attachment refs, an upload issuance/finalization
ledger, and orphan cleanup hooks. `src/services/storage/` remains provider-only
and continues to own bytes and presigned URL behavior.

---

## Decision

`src/services/storage-asset/` now owns the missing middle layer between object
storage and app-owned domain models:

- `storage_asset` remains the generic asset catalog, now with `orphanedAt`
- `storage_asset_ref` tracks which app owners currently reference which assets
- `storage_upload_ledger` tracks browser-direct and other presigned uploads
  before they are finalized into assets
- `StorageAssetInventoryService` becomes the concrete orchestration facade for
  upload issuance, upload completion, finalization, ref sync, orphan marking,
  and purge helpers

The storage family is unchanged. `AbstractStorage` still owns only byte-level
operations, metadata, and presigned URLs.

Family liveness is defined at the root asset level:

- assets are grouped by `parentAssetId`
- any active ref on any asset in a family keeps the whole family live
- when the last family ref disappears, `orphanedAt` is set on the root and all
  descendants
- when a ref reappears before purge, `orphanedAt` is cleared across the family

Tenant scope is first-class on refs and upload ledgers through nullable
`tenantId`. The asset catalog remains tenant-agnostic in this phase so the
catalog stays reusable across apps that do not model tenant ownership at the
asset row level.

### Alternatives Considered

- **Move upload lifecycle into `storage/`:** Rejected because it would push
  DB-backed workflow state into the provider abstraction.
- **Keep refs and upload ledgers entirely app-owned:** Rejected because every
  downstream app would reimplement the same generic tables and cleanup logic.
- **Add per-asset liveness only:** Rejected because existing `parentAssetId`
  families would drift into inconsistent original/variant states.
- **Bundle scheduler or worker runtime behavior:** Rejected because Edge Kit
  should expose cleanup primitives, not impose a job system.

---

## Constraints

- `AbstractStorage` MUST remain provider-focused and MUST NOT gain DB-backed
  upload or attachment state.
- `storage-asset` MUST keep the catalog, refs, and upload ledger generic.
- `source`, `tags`, and `meta` remain caller-owned vocabulary.
- Cleanup remains pull-based library logic. Host apps own scheduling.
- Read URL strategy changes are out of scope for this ADR.

---

## Consequences

Positive:

- downstream apps can issue uploads, finalize them into tracked assets, attach
  them to domain owners, and purge abandoned data without inventing bespoke
  tables and jobs
- asset liveness is explicit and reversible through `orphanedAt`
- the lifecycle layer stays copy-pasteable because persistence is still split
  into small abstract contracts plus concrete Drizzle helpers

Negative:

- `storage-asset` now has more surface area and stronger lifecycle opinion
- callers own more migrations than before

Tech debt deferred or created:

- transactional guarantees across storage deletion and SQL updates remain
  app/runtime dependent
- richer asset read URL strategies remain a follow-up concern

---

## User Flow / Public API / Contract Changes

New public surface under `src/services/storage-asset/`:

- `AbstractStorageAssetRefService`
- `StorageAssetOwnerRef`
- `StorageAssetOwnerRefScope`
- `AbstractStorageUploadLedgerService`
- `StorageUploadLedgerRecord`
- `StorageUploadStatus`
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

Updated existing surface:

- `StorageAssetRecord` now includes `orphanedAt`
- `UpsertStorageAssetInput` and update flows now support `orphanedAt`
- `AbstractStorageAssetService` now supports orphan-root listing, family-root
  resolution, and `orphanedAt` updates
- `StorageAssetInventoryService` now orchestrates upload lifecycle, owner ref
  sync, family liveness reconciliation, and purge helpers

---

## Related ADRs

- [ADR-0002] Add contextualizer, richer storage, and AI runtime support
- [ADR-0010] Add a generic storage-asset catalog and image-generation service
- [ADR-0013] Use an optional storage explorer capability instead of root
  listing APIs
