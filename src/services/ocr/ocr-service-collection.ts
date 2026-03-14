import {
  type AbstractOcrService,
  OcrError,
  type OcrExtractResult,
} from './abstract-ocr';

export class OcrServiceCollection {
  private readonly providers: AbstractOcrService[];

  constructor(providers: AbstractOcrService[]) {
    this.providers = providers;
  }

  resolve(contentType: string): AbstractOcrService {
    for (const provider of this.providers) {
      if (provider.supportsContentType(contentType)) return provider;
    }

    throw new OcrError(
      'NO_PROVIDER',
      `No OCR provider found for content type: ${contentType}`
    );
  }

  async extract(source: {
    url: string;
    contentType: string;
  }): Promise<OcrExtractResult> {
    const providers = this.providers.filter((provider) =>
      provider.supportsContentType(source.contentType)
    );

    if (providers.length === 0) {
      throw new OcrError(
        'NO_PROVIDER',
        `No OCR provider found for content type: ${source.contentType}`
      );
    }

    const errors: string[] = [];

    for (const provider of providers) {
      try {
        return await provider.extract(source);
      } catch (error) {
        if (error instanceof OcrError) {
          errors.push(`${provider.provider}: ${error.message}`);
          continue;
        }

        throw error;
      }
    }

    throw new OcrError(
      'PROVIDER_ERROR',
      `All OCR providers failed: ${errors.join(' | ')}`
    );
  }
}
