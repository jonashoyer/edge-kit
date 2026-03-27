# [0020] Add pluggable image preview metadata builders with a sharp ThumbHash implementation

**Status:** `Implemented`

**Date:** 2026-03-27

---

## TL;DR

Edge Kit adds an optional preview metadata builder hook to
`src/services/storage-asset/` so inventory-backed `image/*` assets can persist
blur-placeholder metadata without changing the storage-asset schema. Edge Kit
also ships one first-party implementation that uses `sharp` plus `thumbhash`
to store ThumbHash previews under caller-owned `meta`.

---

## Decision

Preview generation is added at the `StorageAssetInventoryService` layer, not in
`AbstractStorage` and not as hardcoded catalog columns.

The new reusable contract is a `StorageAssetPreviewMetadataBuilder<TMeta>`
function. It receives the asset write/finalize context plus bytes and returns
the final metadata object to persist, or `undefined` to keep the caller's
original metadata unchanged.

`StorageAssetInventoryService` now:

- optionally invokes a preview metadata builder during `writeAsset(...)`
- optionally invokes the same builder during `finalizeUpload(...)`
- only attempts preview generation for `image/*` MIME types
- fails open when preview generation throws, so asset persistence still
  succeeds

Edge Kit also ships a concrete helper,
`createSharpThumbHashPreviewMetadataBuilder(...)`, that:

- decodes image bytes with `sharp`
- resizes them to fit within `100x100`
- encodes a ThumbHash
- persists a `meta.preview` payload containing the raw hash, a blur `dataUrl`,
  bounded dimensions, and aspect ratio

`ImageGenerationService` is updated only enough to pass
`previewMetadataBuilder` into the inventory instance it composes from
`storage + assetCatalog`. Pure-generation and storage-only modes remain
unchanged.

### Alternatives Considered

- **Put preview support into `AbstractStorage`:** Rejected because it would
  blur provider responsibilities with image-specific metadata enrichment.
- **Add preview columns to `storage_asset`:** Rejected because preview payloads
  are workflow metadata, not generic catalog shape.
- **Keep preview building fully app-owned with no library hook:** Rejected
  because uploads and generated assets would each reimplement the same
  byte-to-preview orchestration.
- **Avoid shipping `sharp` at all:** Rejected for this phase because ThumbHash
  generation needs image decoding and callers asked for an end-to-end first-
  party implementation, not just an abstract hook.

---

## Constraints

- `AbstractStorage` remains byte-oriented and provider-focused.
- `storage_asset` schema remains unchanged; previews live in caller-owned
  metadata.
- Preview enrichment is best-effort and must not block asset persistence by
  default.
- The builder contract must remain generic enough for non-ThumbHash preview
  strategies later.
- Image-generation orchestration must not gain preview logic outside the
  inventory-backed path.

---

## Consequences

Positive:

- inventory-backed uploads and generated images can persist immediately usable
  blur-placeholder data
- preview support remains opt-in and copy-pasteable because it sits behind a
  small contract
- storage and catalog abstractions keep their existing boundaries

Negative:

- Edge Kit now carries one concrete image-processing dependency in support of a
  first-party preview implementation
- inventory writes/finalization for images may do extra decode/resize work

Tech debt deferred or created:

- no background/backfill workflow is included for existing assets
- preview generation error reporting remains caller-owned because the inventory
  service intentionally has no logger dependency

---

## User Flow / Public API / Contract Changes

New public surface under `src/services/storage-asset/`:

- `ThumbHashPreview`
- `StorageAssetPreviewMeta`
- `StorageAssetPreviewMetadataBuilder`
- `StorageAssetPreviewMetadataBuilderContext`
- `createSharpThumbHashPreviewMetadataBuilder(...)`

Updated existing surface:

- `StorageAssetInventoryServiceOptions` now accepts
  `previewMetadataBuilder`
- `ImageGenerationServiceOptions` now accepts `previewMetadataBuilder` for the
  internally composed inventory path
- `ImageGenerationMetaBase` can now include `preview`

---

## Related ADRs

- [ADR-0010] Add a generic storage-asset catalog and image-generation service
- [ADR-0016] Add storage asset refs, upload lifecycle, and orphan cleanup
  primitives
