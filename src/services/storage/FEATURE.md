# Feature: Storage

**Status:** `Active`
**Last Reviewed:** 2026-09-17
**Related ADRs:** [ADR-0002], [ADR-0013]

---

## What This Does

`src/services/storage/` provides the object-storage abstraction used by Edge
Kit plus concrete providers for S3-compatible backends and the local
filesystem. The feature owns object-level operations such as write, read,
delete, existence checks, metadata lookup, and presigned URLs. It also owns
optional capabilities for browse support through `storage.explorer`,
immutable-object publication through `storage.immutable`, multipart session
control through `storage.multipart`, and a storage-side helper that derives
directory-like views from flat keys. It does not own tracked asset metadata or
asset-catalog workflows; those remain in `src/services/storage-asset/`.

## Key Goals

- Keep the base storage contract small and easy to copy into other codebases.
- Preserve S3-compatible portability across providers.
- Prefer provider-native object metadata over sidecar metadata stores.
- Make browse support optional rather than mandatory for every provider.
- Make immutable and multipart capabilities optional rather than pretending
  every storage backend can provide those guarantees.
- Keep directory-style browsing as a derived convenience over flat object keys.

## Implementation Constraints

- Evolve the existing `AbstractStorage` contract in place; do not introduce a
  parallel storage abstraction.
- `AbstractStorage` MUST stay object-focused: write, read, delete, exists,
  bulk delete, metadata, and presigned URLs belong here.
- Browse support MUST hang off optional `storage.explorer`; do not reintroduce
  root-level `list` or `listPage` on `AbstractStorage`.
- Immutable create-only writes, pinned references, version-aware cleanup, and
  multipart session control MUST hang off optional capabilities rather than
  replacing the base write/read/delete methods.
- `storage.explorer` MUST expose flat key listing only. Do not hardcode
  folders, delimiters, or mixed file-and-directory entry types into the base
  provider capability.
- Providers MUST NOT silently emulate immutable guarantees with unconditional
  overwrites. If a backend cannot guarantee the behavior, leave the capability
  absent.
- Version-aware cleanup MUST require an explicit configured versioning mode.
  Do not probe or guess bucket versioning at runtime.
- `StorageInventoryService` MUST stay browse-only in this phase. Do not expand
  it into tracked-vs-untracked reconciliation without a new ADR.
- Preserve copy-paste friendliness and S3-compatible portability.
- Prefer native object metadata support over sidecar metadata objects.
- Accept the legacy `bytesLimit` write-presign option as a compatibility alias
  in this phase.

## Public API / Contracts

- `AbstractStorage`
- `StorageBody`
- `StorageWriteOptions`
- `StorageWritePresignedUrlOptions`
- `StorageObjectMetadata`
- `StorageObjectReference`
- `StorageObjectDescriptor`
- `StorageCreateObjectOptions`
- `StorageCreateObjectResult`
- `StorageDeleteObjectOptions`
- `StorageDeleteObjectError`
- `StorageMultipartUploadSession`
- `StorageMultipartUploadDescriptor`
- `StorageMultipartPartInstruction`
- `StorageMultipartUploadError`
- `StorageImmutableCapability`
- `StorageMultipartCapability`
- `StorageExplorerCapability`
- `StorageExplorerListPageOptions`
- `StorageExplorerListPageResult`
- `exists(key)`
- `deleteMany(keys)`
- `storage.explorer?.list(prefix?)`
- `storage.explorer?.listPage(prefix, options?)`
- `storage.immutable?.head(key, options?)`
- `storage.immutable?.createObject(key, data, options?)`
- `storage.immutable?.createReadPresignedUrl(ref, options?)`
- `storage.immutable?.delete(key, options?)`
- `storage.multipart?.create(key, options?)`
- `storage.multipart?.find(key)`
- `storage.multipart?.listParts(upload)`
- `storage.multipart?.createPartPresignedUrl(upload, partNumber, options?)`
- `storage.multipart?.complete(upload, options?)`
- `storage.multipart?.abort(upload)`
- `StorageInventoryService`
- `StorageDirectoryEntry`
- `StorageDirectoryListing`
- `StorageExplorerUnavailableError`

## Current State

Implemented: `AbstractStorage` now owns only object-level operations, S3 and
local storage providers expose optional `storage.explorer` capabilities for
flat key browsing, `S3Storage` can optionally expose immutable-object and
multipart capabilities when configured explicitly, and
`StorageInventoryService` derives directory-like listings from those flat keys.
Root-level `list` and `listPage` methods were removed from the base storage
contract.

## Known Tech Debt

- `StorageInventoryService` derives directory views by scanning flat keys
  rather than using provider-optimized delimiter or common-prefix APIs. This
  keeps the contract simple, but it is not optimized for very large keyspaces.
- `R2Storage` and `BackblazeStorage` intentionally do not advertise immutable
  or multipart support yet. Their real provider behavior still needs
  provider-specific verification before Edge Kit should expose those
  guarantees.

## What NOT To Do

- Do not rename the API to `upload/download` in this phase.
- Do not introduce DB-backed upload tracking here.
- Do not hardcode one provider’s presign behavior into the abstract contract.
- Do not reintroduce root-level `list` or `listPage` on `AbstractStorage`.
- Do not move tracked asset catalog concerns from `src/services/storage-asset/`
  into the storage provider abstraction.
- Do not treat URL expiry or a successful abort call as proof that in-flight
  multipart writes stopped.
