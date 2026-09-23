import type { AnalyzeOperationOutput } from '@azure-rest/ai-document-intelligence';
import { fetchExt } from '../../utils/fetch-utils';
import {
  AbstractOcrService,
  OcrError,
  type OcrExtractResult,
  type OcrExtractSource,
} from './abstract-ocr';

const trailingSlashPattern = /\/+$/;

export class AzureDocumentIntelligenceOcrService extends AbstractOcrService {
  readonly provider = 'azure-document-intelligence';

  private readonly endpoint: string;
  private readonly key: string;

  constructor(endpoint: string, key: string) {
    super();
    this.endpoint = endpoint.replace(trailingSlashPattern, '');
    this.key = key;
  }

  supportsContentType(contentType: string) {
    return [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'text/html',
      'application/vnd.openxmlformats-officedocument.',
    ].some((e) => contentType.startsWith(e));
  }

  async extract(source: OcrExtractSource): Promise<OcrExtractResult> {
    const result = await this.analyzeDocument(source.url);

    if (!result.content) {
      throw new OcrError('NO_CONTENT', 'No OCR content found');
    }

    return {
      markdown: result.content,
      provider: this.provider,
      title: result.paragraphs?.find((paragraph) => paragraph.role === 'title')
        ?.content,
    };
  }

  private async analyzeDocument(url: string) {
    const analyzeUrl = new URL(
      `${this.endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze`
    );
    analyzeUrl.searchParams.set('api-version', '2024-11-30');
    analyzeUrl.searchParams.set('outputContentFormat', 'markdown');
    analyzeUrl.searchParams.append('features', 'ocrHighResolution');
    analyzeUrl.searchParams.append('features', 'styleFont');

    const initialResponse = await fetchExt({
      init: {
        body: {
          urlSource: url,
        },
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
        },
        method: 'POST',
      },
      retries: 3,
      retryDelay: 1000,
      retryOnHttpStatuses: [408, 409, 425, 429, 500, 502, 503, 504],
      throwOnHttpError: true,
      timeout: 60_000,
      url: analyzeUrl.toString(),
    });

    const operationLocation = initialResponse.headers.get('operation-location');
    if (!operationLocation) {
      throw new OcrError(
        'PROVIDER_ERROR',
        'Document Intelligence operation-location header is missing'
      );
    }

    const initialBody =
      (await initialResponse.json()) as AnalyzeOperationOutput;
    if (
      initialBody.status === 'failed' ||
      initialBody.status === 'canceled' ||
      initialBody.status === 'skipped'
    ) {
      throw new OcrError(
        'PROVIDER_ERROR',
        `Document Intelligence error: ${initialBody.error?.message ?? initialBody.status}`
      );
    }

    const pollResponse = await fetchExt({
      init: {
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
        },
        method: 'GET',
      },
      respectRetryAfter: true,
      retries: 3,
      retryDelay: 1000,
      retryOnHttpStatuses: [408, 409, 425, 429, 500, 502, 503, 504],
      throwOnHttpError: true,
      timeout: 60_000,
      url: operationLocation,
    });

    const body = (await pollResponse.json()) as AnalyzeOperationOutput;
    const status = body.status as
      | 'notStarted'
      | 'running'
      | 'failed'
      | 'succeeded'
      | 'canceled'
      | 'skipped';

    if (status === 'succeeded' && body.analyzeResult) {
      return body.analyzeResult;
    }

    throw new OcrError(
      'PROVIDER_ERROR',
      `Document Intelligence error: ${body.error?.message ?? body.status}`
    );
  }
}
