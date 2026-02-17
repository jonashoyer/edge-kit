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
    const provider = this.resolve(source.contentType);
    return provider.extract(source);
  }
}
