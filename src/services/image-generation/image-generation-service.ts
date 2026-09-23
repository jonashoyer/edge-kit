import { genId } from '../../utils/id-generator';
import { normalizeRelativePath } from '../../utils/path-utils';
import type { AbstractStorage } from '../storage/abstract-storage';
import {
  type AbstractStorageAssetService,
  encodeStorageAssetCursor,
  type StorageAssetRecord,
} from '../storage-asset/abstract-storage-asset';
import { StorageAssetInventoryService } from '../storage-asset/storage-asset-inventory';
import type { StorageAssetPreviewMetadataBuilder } from '../storage-asset/storage-asset-preview';
import type {
  AbstractImageGenerator,
  GeneratedImageAsset,
  ImageGenerationOutput,
  ImageGenerationRequest,
} from './abstract-image-generator';
import {
  GENERATED_STORAGE_ASSET_SOURCE,
  IMAGE_GENERATION_ASSET_KIND,
  type ImageGenerationOriginalAssetMeta,
  type ImageGenerationVariantAssetMeta,
  isImageGenerationOriginalAssetMeta,
  isImageGenerationVariantAssetMeta,
} from './types';

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_HISTORY_SCAN_LIMIT = 25;
const DEFAULT_OBJECT_KEY_PREFIX = 'image-generations';
const MULTIPLE_SLASHES_PATTERN = /\/+/g;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/gi;

const normalizeTags = (tags: string[] | undefined): string[] => {
  if (!tags) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();

    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const mergeExtraMeta = (
  first: Record<string, unknown> | undefined,
  second: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!(first || second)) {
    return;
  }

  return {
    ...(first ?? {}),
    ...(second ?? {}),
  };
};

const sanitizeSegment = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'asset';
};

const mimeTypeToExtension = (mimeType: string): string => {
  const subtype = mimeType.split('/').at(1)?.split(';').at(0)?.trim();

  if (!subtype) {
    return 'bin';
  }

  if (subtype === 'svg+xml') {
    return 'svg';
  }

  return sanitizeSegment(subtype);
};

const buildDefaultObjectKey = (
  prefix: string,
  generationId: string,
  segment: string,
  mimeType: string
): string => {
  const extension = mimeTypeToExtension(mimeType);

  return normalizeRelativePath(
    `${prefix}/${generationId}/${segment}.${extension}`.replace(
      MULTIPLE_SLASHES_PATTERN,
      '/'
    )
  );
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.max(1, Math.floor(limit));
};

const sortVariants = (
  variants: StorageAssetRecord<ImageGenerationVariantAssetMeta>[]
): StorageAssetRecord<ImageGenerationVariantAssetMeta>[] =>
  [...variants].sort((left, right) => {
    if (left.meta.position !== right.meta.position) {
      return left.meta.position - right.meta.position;
    }

    if (left.createdAt.getTime() !== right.createdAt.getTime()) {
      return left.createdAt.getTime() - right.createdAt.getTime();
    }

    return left.id.localeCompare(right.id);
  });

const defaultPreferredVariantSelector = (
  variants: StorageAssetRecord<ImageGenerationVariantAssetMeta>[]
): StorageAssetRecord<ImageGenerationVariantAssetMeta> | null =>
  variants.at(0) ?? null;

const asOriginalAsset = (
  asset: StorageAssetRecord<object> | null,
  kind: string
): StorageAssetRecord<ImageGenerationOriginalAssetMeta> | null => {
  if (!(asset && isImageGenerationOriginalAssetMeta(asset.meta, kind))) {
    return null;
  }

  return asset as StorageAssetRecord<ImageGenerationOriginalAssetMeta>;
};

const asVariantAsset = (
  asset: StorageAssetRecord<object>,
  kind: string
): StorageAssetRecord<ImageGenerationVariantAssetMeta> | null => {
  if (!isImageGenerationVariantAssetMeta(asset.meta, kind)) {
    return null;
  }

  return asset as StorageAssetRecord<ImageGenerationVariantAssetMeta>;
};

export interface ImageGenerationVariantOutput {
  image: GeneratedImageAsset;
  meta?: Record<string, unknown>;
  tags?: string[];
}

export interface ImageGenerationVariantContext<
  TRequest extends ImageGenerationRequest = ImageGenerationRequest,
> {
  generationId: string;
  originalAsset: StorageAssetRecord<ImageGenerationOriginalAssetMeta>;
  output: ImageGenerationOutput;
  request: TRequest;
}

export interface ImageGenerationVariantProducer<
  TRequest extends ImageGenerationRequest = ImageGenerationRequest,
> {
  name: string;
  produce: (
    context: ImageGenerationVariantContext<TRequest>
  ) => Promise<ImageGenerationVariantOutput | null>;
}

export interface GenerateImageAssetsOptions {
  generationId?: string;
  source?: string;
  tags?: string[];
}

export interface GeneratedImageVariantResult {
  image: GeneratedImageAsset;
  meta?: Record<string, unknown>;
  name: string;
  position: number;
  tags?: string[];
}

export interface ImageGenerationServiceOptions<
  TRequest extends ImageGenerationRequest = ImageGenerationRequest,
> {
  assetCatalog?: AbstractStorageAssetService<object>;
  assetInventory?: StorageAssetInventoryService<object>;
  buildOriginalExtraMeta?: (context: {
    generationId: string;
    request: TRequest;
    output: ImageGenerationOutput;
  }) => Record<string, unknown> | undefined;
  buildOriginalObjectKey?: (context: {
    generationId: string;
    request: TRequest;
    output: ImageGenerationOutput;
  }) => string;
  buildVariantObjectKey?: (context: {
    generationId: string;
    request: TRequest;
    output: ImageGenerationOutput;
    variantName: string;
    position: number;
    variant: ImageGenerationVariantOutput;
  }) => string;
  createGenerationId?: (request: TRequest) => string;
  generator: AbstractImageGenerator<TRequest>;
  kind?: string;
  objectKeyPrefix?: string;
  previewMetadataBuilder?: StorageAssetPreviewMetadataBuilder<object>;
  selectPreferredVariant?: (
    variants: StorageAssetRecord<ImageGenerationVariantAssetMeta>[]
  ) => StorageAssetRecord<ImageGenerationVariantAssetMeta> | null;
  source?: string;
  storage?: AbstractStorage;
  variantProducers?: ImageGenerationVariantProducer<TRequest>[];
}

export interface ImageGenerationResult {
  generationId: string;
  original: {
    id: string;
    objectKey: string;
    mimeType: string;
    asset?: StorageAssetRecord<ImageGenerationOriginalAssetMeta>;
  };
  output: ImageGenerationOutput;
  variants: Array<{
    id: string;
    objectKey: string;
    mimeType: string;
    asset?: StorageAssetRecord<ImageGenerationVariantAssetMeta>;
  }>;
}

export interface ImageGenerationPreparedResult {
  output: ImageGenerationOutput;
  variants: GeneratedImageVariantResult[];
}

export interface StoredImageGeneration {
  generationId: string;
  original: StorageAssetRecord<ImageGenerationOriginalAssetMeta>;
  preferredVariant: StorageAssetRecord<ImageGenerationVariantAssetMeta> | null;
  variants: StorageAssetRecord<ImageGenerationVariantAssetMeta>[];
}

export interface ImageGenerationHistoryPage {
  items: StoredImageGeneration[];
  nextCursor?: string;
}

export class ImageGenerationStorageUnavailableError extends Error {
  constructor() {
    super(
      'ImageGenerationService requires storage or asset inventory for generateAndStore'
    );
  }
}

export class ImageGenerationInventoryUnavailableError extends Error {
  constructor() {
    super(
      'ImageGenerationService requires asset inventory for history and stored asset lookups'
    );
  }
}

/**
 * Provider-agnostic image-generation orchestration.
 *
 * Pure generation is always available. Storage, inventory, and history
 * features light up only when the corresponding dependencies are supplied.
 */
export class ImageGenerationService<
  TRequest extends ImageGenerationRequest = ImageGenerationRequest,
> {
  private readonly generator: AbstractImageGenerator<TRequest>;
  private readonly assetInventory?: StorageAssetInventoryService<object>;
  private readonly storage?: AbstractStorage;
  private readonly variantProducers: ImageGenerationVariantProducer<TRequest>[];
  private readonly source: string;
  private readonly kind: string;
  private readonly objectKeyPrefix: string;
  private readonly createGenerationId: (request: TRequest) => string;
  private readonly buildOriginalObjectKey?: ImageGenerationServiceOptions<TRequest>['buildOriginalObjectKey'];
  private readonly buildVariantObjectKey?: ImageGenerationServiceOptions<TRequest>['buildVariantObjectKey'];
  private readonly buildOriginalExtraMeta?: ImageGenerationServiceOptions<TRequest>['buildOriginalExtraMeta'];
  private readonly selectPreferredVariant: NonNullable<
    ImageGenerationServiceOptions<TRequest>['selectPreferredVariant']
  >;

  constructor(options: ImageGenerationServiceOptions<TRequest>) {
    this.generator = options.generator;
    this.assetInventory = this.resolveAssetInventory(options);
    this.storage = options.storage ?? this.assetInventory?.storage;
    this.variantProducers = options.variantProducers ?? [];
    this.source = options.source ?? GENERATED_STORAGE_ASSET_SOURCE;
    this.kind = options.kind ?? IMAGE_GENERATION_ASSET_KIND;
    this.objectKeyPrefix = normalizeRelativePath(
      options.objectKeyPrefix ?? DEFAULT_OBJECT_KEY_PREFIX
    );
    this.createGenerationId = options.createGenerationId ?? (() => genId());
    this.buildOriginalObjectKey = options.buildOriginalObjectKey;
    this.buildVariantObjectKey = options.buildVariantObjectKey;
    this.buildOriginalExtraMeta = options.buildOriginalExtraMeta;
    this.selectPreferredVariant =
      options.selectPreferredVariant ?? defaultPreferredVariantSelector;
  }

  async generate(request: TRequest): Promise<ImageGenerationOutput> {
    return await this.generator.generate(request);
  }

  async generateWithVariants(
    request: TRequest,
    options: Pick<GenerateImageAssetsOptions, 'generationId'> = {}
  ): Promise<ImageGenerationPreparedResult> {
    const generationId =
      options.generationId ?? this.createGenerationId(request);
    const output = await this.generate(request);
    const variants = await this.produceVariants({
      generationId,
      output,
      request,
    });

    return {
      output,
      variants,
    };
  }

  async generateAndStore(
    request: TRequest,
    options: GenerateImageAssetsOptions = {}
  ): Promise<ImageGenerationResult> {
    const storage = this.requireStorage();
    const generationId =
      options.generationId ?? this.createGenerationId(request);
    const source = options.source ?? this.source;
    const prepared = await this.generateWithVariants(request, {
      generationId,
    });
    const originalObjectKey =
      this.buildOriginalObjectKey?.({
        generationId,
        output: prepared.output,
        request,
      }) ??
      buildDefaultObjectKey(
        this.objectKeyPrefix,
        generationId,
        'original',
        prepared.output.image.mimeType
      );

    const original = await this.storeOriginal({
      generationId,
      objectKey: originalObjectKey,
      output: prepared.output,
      request,
      source,
      storage,
      tags: normalizeTags(options.tags),
    });
    const variants: ImageGenerationResult['variants'] = [];

    for (const variant of prepared.variants) {
      variants.push(
        // biome-ignore lint/performance/noAwaitInLoops: Process variants in stable order with bounded storage and generator requests.
        await this.storeVariant({
          generationId,
          output: prepared.output,
          parentId: original.id,
          request,
          rootTags: normalizeTags(options.tags),
          source,
          storage,
          variant,
        })
      );
    }

    return {
      generationId,
      original,
      output: prepared.output,
      variants,
    };
  }

  async getGeneration(
    generationId: string
  ): Promise<StoredImageGeneration | null> {
    const original = asOriginalAsset(
      await this.requireAssetInventory().get(generationId),
      this.kind
    );

    if (!original) {
      return null;
    }

    const variants =
      await this.requireAssetInventory().listChildren(generationId);
    const typedVariants = sortVariants(
      variants.flatMap((variant) => {
        const typed = asVariantAsset(variant, this.kind);
        return typed ? [typed] : [];
      })
    );

    return {
      generationId,
      original,
      preferredVariant: this.selectPreferredVariant(typedVariants),
      variants: typedVariants,
    };
  }

  async listHistory(
    options: { cursor?: string; limit?: number; source?: string } = {}
  ): Promise<ImageGenerationHistoryPage> {
    const limit = clampLimit(options.limit);
    const source = options.source ?? this.source;
    const { originals, nextCursor } = await this.collectHistoryOriginals({
      cursor: options.cursor,
      limit,
      source,
    });
    const variantsByParent = await this.groupVariantsByParent(originals);

    return {
      items: originals.map((original) => {
        const variants = sortVariants(variantsByParent.get(original.id) ?? []);

        return {
          generationId: original.id,
          original,
          preferredVariant: this.selectPreferredVariant(variants),
          variants,
        };
      }),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  private async collectHistoryOriginals(options: {
    cursor?: string;
    limit: number;
    source: string;
  }): Promise<{
    originals: StorageAssetRecord<ImageGenerationOriginalAssetMeta>[];
    nextCursor?: string;
  }> {
    const scanLimit = Math.max(DEFAULT_HISTORY_SCAN_LIMIT, options.limit);
    let assetCursor = options.cursor;
    let nextCursor: string | undefined;
    const originals: StorageAssetRecord<ImageGenerationOriginalAssetMeta>[] =
      [];

    while (originals.length < options.limit) {
      // biome-ignore lint/performance/noAwaitInLoops: Process variants in stable order with bounded storage and generator requests.
      const page = await this.requireAssetInventory().listPage({
        cursor: assetCursor,
        limit: scanLimit,
        order: 'desc',
        parentAssetId: null,
        source: options.source,
      });

      if (page.items.length === 0) {
        return {
          originals,
        };
      }

      const consumed = this.consumeHistoryPage({
        items: page.items,
        limit: options.limit,
        originals,
      });

      if (consumed.nextCursor) {
        return {
          nextCursor: consumed.nextCursor,
          originals,
        };
      }

      if (!page.nextCursor) {
        return {
          originals,
        };
      }

      assetCursor = page.nextCursor;
      ({ nextCursor } = page);
    }

    return {
      originals,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  private consumeHistoryPage(options: {
    items: StorageAssetRecord<object>[];
    limit: number;
    originals: StorageAssetRecord<ImageGenerationOriginalAssetMeta>[];
  }): {
    nextCursor?: string;
  } {
    for (const item of options.items) {
      const consumedCursor = encodeStorageAssetCursor(item, 'desc');
      const original = asOriginalAsset(item, this.kind);

      if (original) {
        options.originals.push(original);
      }

      if (options.originals.length === options.limit) {
        return {
          nextCursor: consumedCursor,
        };
      }
    }

    return {};
  }

  private async groupVariantsByParent(
    originals: StorageAssetRecord<ImageGenerationOriginalAssetMeta>[]
  ): Promise<
    Map<string, StorageAssetRecord<ImageGenerationVariantAssetMeta>[]>
  > {
    const variantRows = await this.requireAssetInventory().listByParentIds(
      originals.map((original) => original.id)
    );
    const variantsByParent = new Map<
      string,
      StorageAssetRecord<ImageGenerationVariantAssetMeta>[]
    >();

    for (const row of variantRows) {
      const variant = asVariantAsset(row, this.kind);

      if (!variant || variant.parentAssetId === null) {
        continue;
      }

      const existing = variantsByParent.get(variant.parentAssetId) ?? [];
      existing.push(variant);
      variantsByParent.set(variant.parentAssetId, existing);
    }

    return variantsByParent;
  }

  private resolveAssetInventory(
    options: ImageGenerationServiceOptions<TRequest>
  ): StorageAssetInventoryService<object> | undefined {
    if (options.assetInventory) {
      return options.assetInventory;
    }

    if (options.storage && options.assetCatalog) {
      return new StorageAssetInventoryService({
        assetCatalog: options.assetCatalog,
        previewMetadataBuilder: options.previewMetadataBuilder,
        storage: options.storage,
      });
    }
  }

  private requireStorage(): AbstractStorage {
    if (!this.storage) {
      throw new ImageGenerationStorageUnavailableError();
    }

    return this.storage;
  }

  private requireAssetInventory(): StorageAssetInventoryService<object> {
    if (!this.assetInventory) {
      throw new ImageGenerationInventoryUnavailableError();
    }

    return this.assetInventory;
  }

  private async produceVariants(context: {
    generationId: string;
    request: TRequest;
    output: ImageGenerationOutput;
  }): Promise<GeneratedImageVariantResult[]> {
    const variants: GeneratedImageVariantResult[] = [];
    const originalAsset: StorageAssetRecord<ImageGenerationOriginalAssetMeta> =
      {
        createdAt: new Date(),
        id: context.generationId,
        meta: this.createOriginalMeta(context),
        mimeType: context.output.image.mimeType,
        objectKey: '',
        orphanedAt: null,
        parentAssetId: null,
        source: this.source,
        tags: [],
        updatedAt: new Date(),
      };
    let position = 0;

    for (const producer of this.variantProducers) {
      // biome-ignore lint/performance/noAwaitInLoops: Process variants in stable order with bounded storage and generator requests.
      const variant = await producer.produce({
        generationId: context.generationId,
        originalAsset,
        output: context.output,
        request: context.request,
      });

      if (!variant) {
        continue;
      }

      variants.push({
        image: variant.image,
        meta: variant.meta,
        name: producer.name,
        position,
        tags: variant.tags,
      });
      position += 1;
    }

    return variants;
  }

  private async storeOriginal(context: {
    storage: AbstractStorage;
    generationId: string;
    source: string;
    request: TRequest;
    output: ImageGenerationOutput;
    objectKey: string;
    tags: string[];
  }): Promise<ImageGenerationResult['original']> {
    if (this.assetInventory) {
      const asset = (await this.assetInventory.writeAsset({
        data: context.output.image.data,
        id: context.generationId,
        meta: this.createOriginalMeta(context),
        mimeType: context.output.image.mimeType,
        objectKey: context.objectKey,
        parentAssetId: null,
        source: context.source,
        tags: context.tags,
      })) as StorageAssetRecord<ImageGenerationOriginalAssetMeta>;

      return {
        asset,
        id: asset.id,
        mimeType: asset.mimeType,
        objectKey: asset.objectKey,
      };
    }

    await context.storage.write(context.objectKey, context.output.image.data, {
      contentType: context.output.image.mimeType,
    });

    return {
      id: context.generationId,
      mimeType: context.output.image.mimeType,
      objectKey: context.objectKey,
    };
  }

  private async storeVariant(context: {
    storage: AbstractStorage;
    generationId: string;
    source: string;
    request: TRequest;
    output: ImageGenerationOutput;
    variant: GeneratedImageVariantResult;
    parentId: string;
    rootTags: string[];
  }): Promise<ImageGenerationResult['variants'][number]> {
    const variantId = `${context.generationId}:${sanitizeSegment(
      context.variant.name
    )}`;
    const objectKey =
      this.buildVariantObjectKey?.({
        generationId: context.generationId,
        output: context.output,
        position: context.variant.position,
        request: context.request,
        variant: {
          image: context.variant.image,
          meta: context.variant.meta,
          tags: context.variant.tags,
        },
        variantName: context.variant.name,
      }) ??
      buildDefaultObjectKey(
        this.objectKeyPrefix,
        context.generationId,
        `variants/${String(context.variant.position).padStart(2, '0')}-${sanitizeSegment(
          context.variant.name
        )}`,
        context.variant.image.mimeType
      );

    if (this.assetInventory) {
      const asset = (await this.assetInventory.writeAsset({
        data: context.variant.image.data,
        id: variantId,
        meta: this.createVariantMeta({
          output: context.output,
          position: context.variant.position,
          request: context.request,
          variant: {
            image: context.variant.image,
            meta: context.variant.meta,
            tags: context.variant.tags,
          },
          variantName: context.variant.name,
        }),
        mimeType: context.variant.image.mimeType,
        objectKey,
        parentAssetId: context.parentId,
        source: context.source,
        tags: normalizeTags([
          ...context.rootTags,
          ...(context.variant.tags ?? []),
        ]),
      })) as StorageAssetRecord<ImageGenerationVariantAssetMeta>;

      return {
        asset,
        id: asset.id,
        mimeType: asset.mimeType,
        objectKey: asset.objectKey,
      };
    }

    await context.storage.write(objectKey, context.variant.image.data, {
      contentType: context.variant.image.mimeType,
    });

    return {
      id: variantId,
      mimeType: context.variant.image.mimeType,
      objectKey,
    };
  }

  private createOriginalMeta(context: {
    generationId: string;
    request: TRequest;
    output: ImageGenerationOutput;
  }): ImageGenerationOriginalAssetMeta {
    return {
      kind: this.kind,
      prompt: context.request.prompt,
      provider: this.generator.provider,
      role: 'original',
      ...(context.output.model || context.request.model
        ? { model: context.output.model ?? context.request.model }
        : {}),
      ...(context.output.revisedPrompt
        ? { revisedPrompt: context.output.revisedPrompt }
        : {}),
      ...(context.output.image.width
        ? { width: context.output.image.width }
        : {}),
      ...(context.output.image.height
        ? { height: context.output.image.height }
        : {}),
      ...(context.output.image.altText
        ? { altText: context.output.image.altText }
        : {}),
      ...(context.output.providerMeta
        ? { providerMeta: context.output.providerMeta }
        : {}),
      ...(this.buildOriginalExtraMeta
        ? {
            extra: this.buildOriginalExtraMeta(context),
          }
        : {}),
    };
  }

  private createVariantMeta(context: {
    request: TRequest;
    output: ImageGenerationOutput;
    variant: ImageGenerationVariantOutput;
    variantName: string;
    position: number;
  }): ImageGenerationVariantAssetMeta {
    const extra = mergeExtraMeta(undefined, context.variant.meta);

    return {
      kind: this.kind,
      position: context.position,
      prompt: context.request.prompt,
      provider: this.generator.provider,
      role: 'variant',
      variant: context.variantName,
      ...(context.output.model || context.request.model
        ? { model: context.output.model ?? context.request.model }
        : {}),
      ...(context.output.revisedPrompt
        ? { revisedPrompt: context.output.revisedPrompt }
        : {}),
      ...(context.variant.image.width
        ? { width: context.variant.image.width }
        : {}),
      ...(context.variant.image.height
        ? { height: context.variant.image.height }
        : {}),
      ...(context.variant.image.altText
        ? { altText: context.variant.image.altText }
        : {}),
      ...(context.output.providerMeta
        ? { providerMeta: context.output.providerMeta }
        : {}),
      ...(extra ? { extra } : {}),
    };
  }
}
