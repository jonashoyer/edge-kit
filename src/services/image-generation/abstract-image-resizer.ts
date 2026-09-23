import type { GeneratedImageAsset } from './abstract-image-generator';
import type { ImageGenerationVariantProducer } from './image-generation-service';

export interface ImageResizeRequest {
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  format?: string;
  height?: number;
  image: GeneratedImageAsset;
  quality?: number;
  width?: number;
}

export interface ImageResizeVariantDefinition {
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  format?: string;
  height?: number;
  meta?: Record<string, unknown>;
  name: string;
  quality?: number;
  tags?: string[];
  width?: number;
}

export abstract class AbstractImageResizer {
  abstract resize(request: ImageResizeRequest): Promise<GeneratedImageAsset>;
}

export const createImageResizeVariantProducers = <
  TRequest extends { prompt: string } = { prompt: string },
>(
  resizer: AbstractImageResizer,
  variants: ImageResizeVariantDefinition[]
): ImageGenerationVariantProducer<TRequest>[] =>
  variants.map((variant) => ({
    name: variant.name,
    async produce({ output }) {
      const image = await resizer.resize({
        fit: variant.fit,
        format: variant.format,
        height: variant.height,
        image: output.image,
        quality: variant.quality,
        width: variant.width,
      });

      return {
        image,
        meta: {
          fit: variant.fit,
          format: variant.format,
          height: variant.height,
          quality: variant.quality,
          width: variant.width,
          ...(variant.meta ?? {}),
        },
        tags: variant.tags,
      };
    },
  }));
