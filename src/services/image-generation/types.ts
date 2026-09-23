import type { ThumbHashPreview } from '../storage-asset/storage-asset-preview';

export const GENERATED_STORAGE_ASSET_SOURCE = 'generated';
export const IMAGE_GENERATION_ASSET_KIND = 'image-generation';

export interface ImageGenerationMetaBase {
  altText?: string;
  extra?: Record<string, unknown>;
  height?: number;
  kind: string;
  model?: string;
  preview?: ThumbHashPreview;
  prompt: string;
  provider: string;
  providerMeta?: Record<string, unknown>;
  revisedPrompt?: string;
  role: 'original' | 'variant';
  width?: number;
}

export interface ImageGenerationOriginalAssetMeta
  extends ImageGenerationMetaBase {
  role: 'original';
}

export interface ImageGenerationVariantAssetMeta
  extends ImageGenerationMetaBase {
  position: number;
  role: 'variant';
  variant: string;
}

export type ImageGenerationAssetMeta =
  | ImageGenerationOriginalAssetMeta
  | ImageGenerationVariantAssetMeta;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isImageGenerationOriginalAssetMeta = (
  meta: unknown,
  kind = IMAGE_GENERATION_ASSET_KIND
): meta is ImageGenerationOriginalAssetMeta =>
  isRecord(meta) &&
  meta.kind === kind &&
  meta.role === 'original' &&
  typeof meta.provider === 'string' &&
  typeof meta.prompt === 'string';

export const isImageGenerationVariantAssetMeta = (
  meta: unknown,
  kind = IMAGE_GENERATION_ASSET_KIND
): meta is ImageGenerationVariantAssetMeta =>
  isRecord(meta) &&
  meta.kind === kind &&
  meta.role === 'variant' &&
  typeof meta.provider === 'string' &&
  typeof meta.prompt === 'string' &&
  typeof meta.variant === 'string' &&
  typeof meta.position === 'number';
