# [0013] Use an optional storage explorer capability instead of root listing APIs

**Status:** `Implemented`

**Date:** 2026-03-21

---

## TL;DR

Edge Kit now keeps `src/services/storage/abstract-storage.ts` focused on
 single-object storage operations and move listing and browsing behind an
 optional `storage.explorer` capability. This keeps the base storage contract
 small and copy-paste friendly while allowing providers that support browsing
 to expose flat key listing and higher-level browse helpers without forcing
 those concerns into every storage implementation.

---

## Decision

`src/services/storage/abstract-storage.ts` now defines a small object-storage
 contract that owns only object-level operations such as `write`, `read`,
 `delete`, `exists`, `objectMetadata`, `deleteMany`, and presigned URL
 creation. Root-level `list` and `listPage` methods will be removed from
 `AbstractStorage`.

Browsing behavior will move behind an optional nested capability on storage
 instances:

- `storage.explorer?.listPage(prefix?, options?)`
- `storage.explorer?.list(prefix?)`

The explorer capability will return flat object keys only. It will not model
 folders, common prefixes, or mixed file-and-directory entry types at the
 provider contract level.

`src/services/storage/` will also add a browse-only `StorageInventoryService`
 that composes an `AbstractStorage` instance with `storage.explorer` to derive
 directory-like listings from flat keys. This helper stays in the storage
 family and does not create a separate explorer service family. The shipped
 helper exposes `listKeys(prefix?, options?)`, `listDirectory(prefix?)`, and a
 typed `StorageExplorerUnavailableError` when callers request browse behavior
 from a provider that does not expose `storage.explorer`.

`src/services/storage-asset/` remains a separate service family for tracked
 asset metadata and asset-centric inventory workflows. This ADR does not merge
 catalog or asset inventory concerns into `AbstractStorage`.

### Alternatives Considered

- **Keep `list` and `listPage` on `AbstractStorage`:** Rejected because it
  forces all providers to carry browse semantics even when callers only need
  object-level reads, writes, deletes, and metadata.
- **Add a dedicated `storage-explorer` service family:** Rejected because it
  creates another top-level domain when an optional capability plus a storage
  helper keeps the service atoms smaller and easier to copy.
- **Model folders directly in provider explorer APIs:** Rejected because S3-like
  storage is fundamentally key-based and folder semantics are better derived in
  a higher-level browse helper.

---

## Constraints

- `AbstractStorage` MUST remain usable for providers that do not support
  browsing. Explorer support is optional and represented by
  `storage.explorer` being absent.
- Future storage providers MUST NOT reintroduce root-level `list` or
  `listPage` methods on `AbstractStorage` without a superseding ADR.
- `storage.explorer` MUST expose flat key listing only. Do not hardcode folder
  or delimiter semantics into the base explorer capability.
- Browse-oriented directory projections MUST live in `src/services/storage/`,
  not in `src/services/storage-asset/`.
- `src/services/storage-asset/` MUST remain focused on tracked asset metadata
  and asset-centric workflows. Do not merge storage-asset catalog concerns
  into the storage provider abstraction.
- Any future reconciliation of tracked versus untracked objects requires a new
  ADR before broadening the browse-only storage inventory helper.

---

## Consequences

Positive: The base storage contract becomes smaller and easier to copy into
 applications that only need object-level behavior, while S3 and local
 providers can still expose optional browsing.

Negative: Callers that currently rely on `storage.list(...)` or
 `storage.listPage(...)` must migrate to `storage.explorer` or a storage-side
 inventory helper.

Tech debt deferred or created: Directory-like browsing will initially be a
 derived projection over flat keys rather than a provider-optimized delimiter
 listing API.

Observed tradeoff: the local filesystem provider now enumerates the base tree
 and filters keys in memory to preserve object-storage-style prefix semantics,
 which keeps behavior consistent with S3-compatible providers but is less
 efficient for large local directories.

---

## Assumptions and Defaults

- Assumes explorer support is common for S3-compatible and local providers, but
  not guaranteed for every current or future `AbstractStorage` implementation.
- Assumes flat key listing is the only cross-provider browse primitive worth
  standardizing in this phase.
- Assumes any directory view returned by `StorageInventoryService` is a derived
  convenience projection rather than a real filesystem guarantee.
- Assumes browse helpers should fail explicitly when explorer support is absent
  rather than silently returning empty listings. This assumption held and was
  implemented via `StorageExplorerUnavailableError`.

---

## User Flow / Public API / Contract Changes

Before:

- `storage.list(prefix?)`
- `storage.listPage(prefix?, options?)`

After:

- `storage.explorer?.list(prefix?)`
- `storage.explorer?.listPage(prefix?, options?)`
- `new StorageInventoryService({ storage }).listDirectory(prefix?)`

New provider contract surface:

- `StorageExplorerListPageOptions`
- `StorageExplorerListPageResult`
- `StorageExplorerCapability`
- optional `explorer` property on `AbstractStorage`

---

## Related ADRs

- [ADR-0002] Add contextualizer, richer storage, and AI runtime support
- [ADR-0010] Add a generic storage-asset catalog and image-generation service
