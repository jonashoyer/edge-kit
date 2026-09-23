import type { StorageBody } from '../storage/abstract-storage';

export interface GeneratedImageAsset {
  altText?: string;
  data: StorageBody;
  height?: number;
  mimeType: string;
  width?: number;
}

export interface ImageGenerationRequest {
  model?: string;
  negativePrompt?: string;
  options?: Record<string, unknown>;
  prompt: string;
  seed?: number | string;
  size?: string;
  user?: string;
}

export interface ImageGenerationOutput {
  image: GeneratedImageAsset;
  model?: string;
  providerMeta?: Record<string, unknown>;
  revisedPrompt?: string;
}

export abstract class AbstractImageGenerator<
  TRequest extends ImageGenerationRequest = ImageGenerationRequest,
> {
  abstract readonly provider: string;

  abstract generate(request: TRequest): Promise<ImageGenerationOutput>;
}
