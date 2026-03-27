# Feature: Image Generation

Status: Active
Last Reviewed: 2026-03-27

## Current State

`src/services/image-generation/` provides a provider-agnostic orchestration
layer for generating an image, optionally persisting the original to object
storage, optionally recording the original as a root `storage_asset`, and
optionally recording derived variants as child assets.

Pure generation works with only an `AbstractImageGenerator`. Storage-backed
generation works when `AbstractStorage` is supplied. Inventory-backed history
and asset lookups work when `StorageAssetInventoryService` is supplied, or when
the service composes one from `storage + assetCatalog`.

The service also exposes a history projection over generated root assets and a
pluggable variant-producer hook for downstream transforms such as thumbnails,
social crops, or alternate encodings. When the service composes its own
inventory layer from `storage + assetCatalog`, it can also pass through an
optional preview metadata builder so persisted originals and variants gain
image preview metadata in the catalog.

## Implementation Constraints

- Keep queue ownership, retries, and provider-specific rate policies outside
  this service family.
- Keep pure generation usable without storage dependencies.
- Depend on `StorageAssetInventoryService` for inventory-backed reads and
  history rather than on a storage provider directly.
- Keep image metadata conventions generic enough to coexist with uploads and
  other asset sources in the same catalog.
- Use pluggable variant producers instead of bundling a fixed image-processing
  dependency into Edge Kit.

## Public API / Contracts

- `AbstractImageGenerator`
- `ImageGenerationRequest`
- `ImageGenerationOutput`
- `ImageGenerationService`
- `ImageGenerationVariantProducer`
- `ImageGenerationOriginalAssetMeta`
- `ImageGenerationVariantAssetMeta`

## What NOT To Do

- Do not hardwire one queue runtime, worker framework, or provider SDK here.
- Do not assume every catalog asset is image-generation output.
- Do not move generic asset catalog concerns into this service family.
- Do not require asset inventory just to generate or to write bytes to storage.
