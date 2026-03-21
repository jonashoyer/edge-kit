import type { StorageBody } from '../storage/abstract-storage';

export interface GeneratedImageAsset {
  data: StorageBody;
  mimeType: string;
  width?: number;
  height?: number;
  altText?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  seed?: number | string;
  negativePrompt?: string;
  user?: string;
  options?: Record<string, unknown>;
}

export interface ImageGenerationOutput {
  image: GeneratedImageAsset;
  model?: string;
  revisedPrompt?: string;
  providerMeta?: Record<string, unknown>;
}

export abstract class AbstractImageGenerator<
  TRequest extends ImageGenerationRequest = ImageGenerationRequest,
> {
  abstract readonly provider: string;

  abstract generate(request: TRequest): Promise<ImageGenerationOutput>;
}
