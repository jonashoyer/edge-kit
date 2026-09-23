import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeepResearchError } from './abstract-deep-research';
import { GeminiDeepResearchService } from './gemini-deep-research';

interface FetchCall {
  init: RequestInit;
  url: string;
}

const apiKey = 'test-gemini-key';
const baseUrl = 'https://gemini.test/v1beta';

const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  });

const parseBody = (call: FetchCall): Record<string, unknown> =>
  JSON.parse(String(call.init.body)) as Record<string, unknown>;

const createService = (): GeminiDeepResearchService =>
  new GeminiDeepResearchService({
    apiKey,
    baseUrl,
    pollIntervalMs: 0,
    retries: 0,
  });

describe('GeminiDeepResearchService', () => {
  const originalFetch = globalThis.fetch;
  let calls: FetchCall[];
  let responses: Response[];

  beforeEach(() => {
    calls = [];
    responses = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({
        init: init ?? {},
        url: String(input),
      });

      const response = responses.shift();
      if (!response) {
        throw new Error('No mock response queued');
      }

      return response;
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('starts stored background research with Gemini request fields', async () => {
    responses.push(
      jsonResponse({
        agent: 'deep-research-preview-04-2026',
        id: 'interaction-1',
        status: 'in_progress',
      })
    );

    const result = await createService().startResearch({
      agentConfig: {
        collaborativePlanning: true,
        thinkingSummaries: 'auto',
        visualization: 'auto',
      },
      input: 'Research TypeScript queue patterns.',
    });

    expect(result).toMatchObject({
      agent: 'deep-research-preview-04-2026',
      id: 'interaction-1',
      provider: 'gemini',
      status: 'in_progress',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${baseUrl}/interactions`);
    expect(calls[0]?.init.method).toBe('POST');

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('x-goog-api-key')).toBe(apiKey);

    const body = parseBody(calls[0] as FetchCall);
    expect(body).toMatchObject({
      agent: 'deep-research-preview-04-2026',
      agent_config: {
        collaborative_planning: true,
        thinking_summaries: 'auto',
        type: 'deep-research',
        visualization: 'auto',
      },
      background: true,
      input: 'Research TypeScript queue patterns.',
      store: true,
    });
  });

  it('maps multimodal input, tools, max agent, and previous interaction ids', async () => {
    responses.push(
      jsonResponse({
        id: 'interaction-2',
        status: 'in_progress',
      })
    );

    await createService().continueResearch({
      agentMode: 'max',
      input: [
        { text: 'Compare this document to current news.', type: 'text' },
        {
          mimeType: 'application/pdf',
          type: 'document',
          uri: 'https://example.test/report.pdf',
        },
      ],
      previousInteractionId: 'interaction-1',
      tools: [
        { type: 'google_search' },
        {
          allowedTools: ['deployment_status'],
          headers: { Authorization: 'Bearer token' },
          name: 'Deployment Tracker',
          type: 'mcp_server',
          url: 'https://mcp.example.test/mcp',
        },
        {
          fileSearchStoreNames: ['fileSearchStores/store-1'],
          type: 'file_search',
        },
      ],
    });

    const body = parseBody(calls[0] as FetchCall);
    expect(body).toMatchObject({
      agent: 'deep-research-max-preview-04-2026',
      previous_interaction_id: 'interaction-1',
    });
    expect(body.input).toEqual([
      { text: 'Compare this document to current news.', type: 'text' },
      {
        mime_type: 'application/pdf',
        type: 'document',
        uri: 'https://example.test/report.pdf',
      },
    ]);
    expect(body.tools).toEqual([
      { type: 'google_search' },
      {
        allowed_tools: ['deployment_status'],
        headers: { Authorization: 'Bearer token' },
        name: 'Deployment Tracker',
        type: 'mcp_server',
        url: 'https://mcp.example.test/mcp',
      },
      {
        file_search_store_names: ['fileSearchStores/store-1'],
        type: 'file_search',
      },
    ]);
  });

  it('normalizes completed research outputs', async () => {
    responses.push(
      jsonResponse({
        id: 'interaction-3',
        outputs: [
          { text: 'Final report', type: 'text' },
          { data: 'base64-data', mime_type: 'image/png', type: 'image' },
          {
            id: 'source-1',
            title: 'Example Source',
            type: 'source-url',
            url: 'https://example.test/source',
          },
          { text: 'Checked source quality.', type: 'thought_summary' },
        ],
        status: 'completed',
      })
    );

    const result = await createService().getResearch({ id: 'interaction-3' });

    expect(calls[0]?.url).toBe(`${baseUrl}/interactions/interaction-3`);
    expect(calls[0]?.init.method).toBe('GET');
    expect(result.text).toBe('Final report');
    expect(result.message).toMatchObject({
      id: 'interaction-3',
      metadata: {
        interactionId: 'interaction-3',
        provider: 'gemini',
        status: 'completed',
      },
      role: 'assistant',
    });
    expect(result.message.parts).toEqual([
      {
        providerMetadata: {
          gemini: { text: 'Final report', type: 'text' },
        },
        text: 'Final report',
        type: 'text',
      },
      {
        mediaType: 'image/png',
        providerMetadata: {
          gemini: {
            data: 'base64-data',
            mime_type: 'image/png',
            type: 'image',
          },
        },
        type: 'file',
        url: 'data:image/png;base64,base64-data',
      },
      {
        providerMetadata: {
          gemini: {
            id: 'source-1',
            title: 'Example Source',
            type: 'source-url',
            url: 'https://example.test/source',
          },
        },
        sourceId: 'source-1',
        title: 'Example Source',
        type: 'source-url',
        url: 'https://example.test/source',
      },
      {
        providerMetadata: {
          gemini: {
            text: 'Checked source quality.',
            type: 'thought_summary',
          },
        },
        state: 'done',
        text: 'Checked source quality.',
        type: 'reasoning',
      },
    ]);
  });

  it('polls until completion', async () => {
    responses.push(
      jsonResponse({ id: 'interaction-4', status: 'in_progress' }),
      jsonResponse({
        id: 'interaction-4',
        outputs: [{ text: 'Done', type: 'text' }],
        status: 'completed',
      })
    );

    const result = await createService().waitForCompletion({
      id: 'interaction-4',
      pollIntervalMs: 0,
      timeoutMs: 1000,
    });

    expect(result.status).toBe('completed');
    expect(result.text).toBe('Done');
    expect(calls).toHaveLength(2);
  });

  it('throws typed errors for failed research interactions', async () => {
    responses.push(
      jsonResponse({
        error: {
          code: 'FAILED_PRECONDITION',
          message: 'Research failed',
        },
        id: 'interaction-5',
        status: 'failed',
      })
    );

    await expect(
      createService().waitForCompletion({
        id: 'interaction-5',
        pollIntervalMs: 0,
        timeoutMs: 1000,
      })
    ).rejects.toMatchObject({
      code: 'FAILED',
      interactionId: 'interaction-5',
      providerError: {
        code: 'FAILED_PRECONDITION',
        message: 'Research failed',
      },
    } satisfies Partial<DeepResearchError>);
  });

  it('times out while waiting for long-running research', async () => {
    responses.push(
      jsonResponse({ id: 'interaction-6', status: 'in_progress' })
    );

    await expect(
      createService().waitForCompletion({
        id: 'interaction-6',
        pollIntervalMs: 0,
        timeoutMs: 0,
      })
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
      interactionId: 'interaction-6',
    } satisfies Partial<DeepResearchError>);
  });

  it('wraps provider HTTP errors without exposing the API key', async () => {
    responses.push(
      jsonResponse(
        {
          error: {
            message: 'Invalid request',
          },
          id: 'interaction-7',
          status: 'failed',
        },
        400
      )
    );

    await expect(
      createService().startResearch({
        input: 'Research invalid request.',
      })
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      interactionId: 'interaction-7',
      providerError: {
        message: 'Invalid request',
      },
    } satisfies Partial<DeepResearchError>);

    await expect(
      createService().startResearch({
        input: 'No response queued.',
      })
    ).rejects.not.toThrow(apiKey);
  });
});
