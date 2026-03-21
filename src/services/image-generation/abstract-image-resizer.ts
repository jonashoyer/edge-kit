import type { GeneratedImageAsset } from './abstract-image-generator';
import type { ImageGenerationVariantProducer } from './image-generation-service';

export interface ImageResizeRequest {
  image: GeneratedImageAsset;
  width?: number;
  height?: number;
  format?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  quality?: number;
}

export interface ImageResizeVariantDefinition {
  name: string;
  width?: number;
  height?: number;
  format?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  quality?: number;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export abstract class AbstractImageResizer {
  abstract resize(request: ImageResizeRequest): Promise<GeneratedImageAsset>;
}

export const createImageResizeVariantProducers = <
  TRequest extends { prompt: string } = { prompt: string },
>(
  resizer: AbstractImageResizer,
  variants: ImageResizeVariantDefinition[]
): ImageGenerationVariantProducer<TRequest>[] => {
  return variants.map((variant) => ({
    name: variant.name,
    async produce({ output }) {
      const image = await resizer.resize({
        image: output.image,
        width: variant.width,
        height: variant.height,
        format: variant.format,
        fit: variant.fit,
        quality: variant.quality,
      });

      return {
        image,
        tags: variant.tags,
        meta: {
          width: variant.width,
          height: variant.height,
          format: variant.format,
          fit: variant.fit,
          quality: variant.quality,
          ...(variant.meta ?? {}),
        },
      };
    },
  }));
};
