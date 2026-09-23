import sharp from 'sharp';
import {
  rgbaToThumbHash,
  thumbHashToApproximateAspectRatio,
  thumbHashToDataURL,
} from 'thumbhash';

const DEFAULT_MAXIMUM_DIMENSION = 100;

export interface ThumbHashPreview {
  aspectRatio: number;
  dataUrl: string;
  height: number;
  kind: 'thumbhash';
  value: string;
  width: number;
}

export interface StorageAssetPreviewMeta {
  preview?: ThumbHashPreview;
}

export interface StorageAssetPreviewMetadataBuilderContext<
  TMeta extends object = Record<string, unknown>,
> {
  data: Uint8Array;
  id: string;
  meta?: TMeta;
  mimeType: string;
  objectKey: string;
  parentAssetId: string | null;
  source: string;
  tags: string[];
}

/**
 * Builds the final metadata object for a previewable asset.
 *
 * Returning `undefined` tells the inventory service to persist the caller's
 * original metadata unchanged.
 */
export type StorageAssetPreviewMetadataBuilder<
  TMeta extends object = Record<string, unknown>,
> = (
  context: StorageAssetPreviewMetadataBuilderContext<TMeta>
) => Promise<TMeta | undefined>;

export interface SharpThumbHashPreviewMetadataBuilderOptions<
  TMeta extends StorageAssetPreviewMeta = StorageAssetPreviewMeta,
> {
  maximumDimension?: number;
  mergeMeta?: (
    meta: TMeta | undefined,
    preview: ThumbHashPreview,
    context: StorageAssetPreviewMetadataBuilderContext<TMeta>
  ) => TMeta;
}

const normalizeMaximumDimension = (value: number | undefined): number => {
  if (value === undefined) {
    return DEFAULT_MAXIMUM_DIMENSION;
  }

  if (!(Number.isInteger(value) && value >= 1)) {
    throw new Error(
      'Sharp ThumbHash preview maximumDimension must be an integer >= 1'
    );
  }

  return Math.min(DEFAULT_MAXIMUM_DIMENSION, value);
};

const createThumbHashPreview = async (
  data: Uint8Array,
  maximumDimension: number
): Promise<ThumbHashPreview> => {
  const buffer = Buffer.from(data);
  const resized = await sharp(buffer)
    .rotate()
    .resize({
      fit: 'inside',
      height: maximumDimension,
      width: maximumDimension,
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  const hash = rgbaToThumbHash(
    resized.info.width,
    resized.info.height,
    resized.data
  );

  return {
    aspectRatio: thumbHashToApproximateAspectRatio(hash),
    dataUrl: thumbHashToDataURL(hash),
    height: resized.info.height,
    kind: 'thumbhash',
    value: Buffer.from(hash).toString('base64url'),
    width: resized.info.width,
  };
};

/**
 * Creates a metadata builder that decodes images with sharp and stores a
 * ThumbHash preview payload under `meta.preview`.
 */
export const createSharpThumbHashPreviewMetadataBuilder = <
  TMeta extends StorageAssetPreviewMeta = StorageAssetPreviewMeta,
>(
  options: SharpThumbHashPreviewMetadataBuilderOptions<TMeta> = {}
): StorageAssetPreviewMetadataBuilder<TMeta> => {
  const maximumDimension = normalizeMaximumDimension(options.maximumDimension);

  return async (context) => {
    const preview = await createThumbHashPreview(
      context.data,
      maximumDimension
    );

    if (options.mergeMeta) {
      return options.mergeMeta(context.meta, preview, context);
    }

    return {
      ...(context.meta ?? {}),
      preview,
    } as TMeta;
  };
};
