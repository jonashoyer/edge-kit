# Image Generation

The `image-generation` service family provides a reusable orchestration layer
for generating one image, optionally persisting it to object storage, and
optionally registering the resulting files in the `storage-asset` inventory.

## Overview

The service lets you:

- Plug in any provider through `AbstractImageGenerator`
- Generate an image without any storage dependency
- Persist originals and variants to raw object storage when storage is present
- Persist original outputs with a stable generation id
- Persist derived variants through pluggable variant producers
- Reuse one asset catalog alongside uploads and imports when inventory is present
- Project generation history from generated root assets only

It intentionally does **not** own queueing, retries, or worker scheduling.

## Provider Contract

```ts
abstract class AbstractImageGenerator<TRequest = ImageGenerationRequest> {
  abstract readonly provider: string;
  abstract generate(request: TRequest): Promise<{
    image: {
      data: StorageBody;
      mimeType: string;
      width?: number;
      height?: number;
      altText?: string;
    };
    model?: string;
    revisedPrompt?: string;
    providerMeta?: Record<string, unknown>;
  }>;
}
```

## Orchestration Service

`ImageGenerationService` composes:

- `AbstractImageGenerator`
- optional `AbstractStorage`
- optional `StorageAssetInventoryService`
- optional `AbstractStorageAssetService` when you want the service to compose
  its own inventory manager from `storage + assetCatalog`
- optional `ImageGenerationVariantProducer[]`

Example:

```ts
import { ImageGenerationService } from '../services/image-generation/image-generation-service';

const imageGeneration = new ImageGenerationService({
  generator,
  assetInventory,
  variantProducers: [
    {
      name: 'thumb',
      async produce({ output }) {
        return {
          image: await thumbnailer.toWebp(output.image),
          tags: ['thumb'],
          meta: { preset: 'square' },
        };
      },
    },
  ],
});

const result = await imageGeneration.generateAndStore(
  {
    prompt: 'Editorial portrait with warm daylight',
    model: 'my-image-model',
  },
  {
    generationId: 'img_123',
    tags: ['marketing'],
  }
);
```

The generated original becomes the root asset with id `img_123`. Variants are
stored as child assets through `parentAssetId`.

If you only want generation, call `generate(request)`.

If you want storage without inventory, pass `storage` only and call
`generateAndStore(...)`. The returned original and variants include the stored
`objectKey`, but not catalog records.

If you pass `storage + assetCatalog`, `ImageGenerationService` will compose its
own `StorageAssetInventoryService`. If you already have one, pass
`assetInventory` directly.

## Metadata Conventions

The service ships default metadata shapes:

- `ImageGenerationOriginalAssetMeta`
- `ImageGenerationVariantAssetMeta`

By default:

- `source` is `generated`
- `kind` is `image-generation`
- original assets use `role: 'original'`
- variant assets use `role: 'variant'` plus `variant` and `position`

You can add extra root metadata with `buildOriginalExtraMeta(...)`, override
object-key builders, or provide your own preferred-variant selector.

## History Projection

The history API scans root assets for:

- `source === 'generated'`
- `parentAssetId === null`
- `meta.kind === 'image-generation'`

and returns:

- original asset
- preferred variant
- ordered variants

Example:

```ts
const page = await imageGeneration.listHistory({
  limit: 20,
  cursor,
});
```

History and `getGeneration(...)` require inventory. They are unavailable when
the service is configured with generation-only or storage-only dependencies.

## Best Practices

- Run this service inside your app-owned queue or worker if generation latency
  matters.
- Keep provider-specific request tuning in your `AbstractImageGenerator`
  implementation.
- Use variant producers for downstream transforms instead of baking one image
  library into the orchestration service.
- Keep uploads/imports in the same asset catalog when you want one asset
  history model across workflows.
