export interface OcrExtractSource {
  url: string;
  contentType: string;
}

export interface OcrExtractResult {
  provider: string;
  markdown: string;
  title?: string;
}

export type OcrErrorCode = 'NO_PROVIDER' | 'NO_CONTENT' | 'PROVIDER_ERROR';

export class OcrError extends Error {
  readonly code: OcrErrorCode;

  constructor(code: OcrErrorCode, message: string) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
  }
}

export abstract class AbstractOcrService {
  abstract readonly provider: string;

  abstract supportsContentType(contentType: string): boolean;

  abstract extract(source: OcrExtractSource): Promise<OcrExtractResult>;
}
