import { describe, expect, it } from 'vitest';

import { AbstractOcrService, OcrError } from './abstract-ocr';
import { OcrServiceCollection } from './ocr-service-collection';

class TestOcrService extends AbstractOcrService {
  readonly provider: string;
  private readonly shouldFail: boolean;

  constructor(provider: string, shouldFail = false) {
    super();
    this.provider = provider;
    this.shouldFail = shouldFail;
  }

  supportsContentType(contentType: string): boolean {
    return contentType === 'application/pdf';
  }

  async extract() {
    if (this.shouldFail) {
      throw new OcrError('PROVIDER_ERROR', `${this.provider} failed`);
    }

    return {
      provider: this.provider,
      markdown: 'ok',
    };
  }
}

describe('OcrServiceCollection', () => {
  it('falls back to later matching providers', async () => {
    const collection = new OcrServiceCollection([
      new TestOcrService('first', true),
      new TestOcrService('second'),
    ]);

    const result = await collection.extract({
      url: 'https://example.com/file.pdf',
      contentType: 'application/pdf',
    });

    expect(result.provider).toBe('second');
    expect(result.markdown).toBe('ok');
  });

  it('aggregates OCR provider failures', async () => {
    const collection = new OcrServiceCollection([
      new TestOcrService('first', true),
      new TestOcrService('second', true),
    ]);

    await expect(
      collection.extract({
        url: 'https://example.com/file.pdf',
        contentType: 'application/pdf',
      })
    ).rejects.toThrow('All OCR providers failed');
  });
});
