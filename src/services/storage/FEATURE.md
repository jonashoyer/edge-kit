# Feature: Storage

Status: Active
Last Reviewed: 2026-03-14

## Current State

`src/services/storage/` provides object-storage abstractions and concrete
providers for S3-compatible backends and the local filesystem.

The public API keeps `write/read` naming in this phase, but now includes
existence checks, bulk deletes, paginated listing, richer write-body support,
and improved write presign support.

## Implementation Constraints

- Evolve the existing `AbstractStorage` contract in place; do not introduce a
  parallel storage abstraction.
- Preserve copy-paste friendliness and S3-compatible portability.
- Prefer native object metadata support over sidecar metadata objects.
- Accept the legacy `bytesLimit` write-presign option as a compatibility alias
  in this phase.

## Public API / Contracts

- `AbstractStorage`
- `StorageBody`
- `StorageWriteOptions`
- `StorageListPageResult`
- `StorageWritePresignedUrlOptions`
- `exists(key)`
- `deleteMany(keys)`
- `listPage(prefix, options?)`

## What NOT To Do

- Do not rename the API to `upload/download` in this phase.
- Do not introduce DB-backed upload tracking here.
- Do not hardcode one provider’s presign behavior into the abstract contract.
