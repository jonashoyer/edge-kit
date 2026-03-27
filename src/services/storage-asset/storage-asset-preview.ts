import sharp from 'sharp';
import {
  rgbaToThumbHash,
  thumbHashToApproximateAspectRatio,
  thumbHashToDataURL,
} from 'thumbhash';

const DEFAULT_MAXIMUM_DIMENSION = 100;

export interface ThumbHashPreview {
  kind: 'thumbhash';
  value: string;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface StorageAssetPreviewMeta {
  preview?: ThumbHashPreview;
}

export interface StorageAssetPreviewMetadataBuilderContext<
  TMeta extends object = Record<string, unknown>,
> {
  id: string;
  objectKey: string;
  mimeType: string;
  source: string;
  parentAssetId: string | null;
  tags: string[];
  meta?: TMeta;
  data: Uint8Array;
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
      width: maximumDimension,
      height: maximumDimension,
      fit: 'inside',
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
    kind: 'thumbhash',
    value: Buffer.from(hash).toString('base64url'),
    dataUrl: thumbHashToDataURL(hash),
    width: resized.info.width,
    height: resized.info.height,
    aspectRatio: thumbHashToApproximateAspectRatio(hash),
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
