export const GENERATED_STORAGE_ASSET_SOURCE = 'generated';
export const IMAGE_GENERATION_ASSET_KIND = 'image-generation';

export interface ImageGenerationMetaBase {
  kind: string;
  provider: string;
  prompt: string;
  role: 'original' | 'variant';
  model?: string;
  revisedPrompt?: string;
  width?: number;
  height?: number;
  altText?: string;
  providerMeta?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface ImageGenerationOriginalAssetMeta
  extends ImageGenerationMetaBase {
  role: 'original';
}

export interface ImageGenerationVariantAssetMeta
  extends ImageGenerationMetaBase {
  role: 'variant';
  variant: string;
  position: number;
}

export type ImageGenerationAssetMeta =
  | ImageGenerationOriginalAssetMeta
  | ImageGenerationVariantAssetMeta;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const isImageGenerationOriginalAssetMeta = (
  meta: unknown,
  kind = IMAGE_GENERATION_ASSET_KIND
): meta is ImageGenerationOriginalAssetMeta => {
  return (
    isRecord(meta) &&
    meta.kind === kind &&
    meta.role === 'original' &&
    typeof meta.provider === 'string' &&
    typeof meta.prompt === 'string'
  );
};

export const isImageGenerationVariantAssetMeta = (
  meta: unknown,
  kind = IMAGE_GENERATION_ASSET_KIND
): meta is ImageGenerationVariantAssetMeta => {
  return (
    isRecord(meta) &&
    meta.kind === kind &&
    meta.role === 'variant' &&
    typeof meta.provider === 'string' &&
    typeof meta.prompt === 'string' &&
    typeof meta.variant === 'string' &&
    typeof meta.position === 'number'
  );
};
