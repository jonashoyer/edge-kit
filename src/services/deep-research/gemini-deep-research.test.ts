import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeepResearchError } from './abstract-deep-research';
import { GeminiDeepResearchService } from './gemini-deep-research';

interface FetchCall {
  url: string;
  init: RequestInit;
}

const apiKey = 'test-gemini-key';
const baseUrl = 'https://gemini.test/v1beta';

const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
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
        url: String(input),
        init: init ?? {},
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
        id: 'interaction-1',
        status: 'in_progress',
        agent: 'deep-research-preview-04-2026',
      })
    );

    const result = await createService().startResearch({
      input: 'Research TypeScript queue patterns.',
      agentConfig: {
        thinkingSummaries: 'auto',
        visualization: 'auto',
        collaborativePlanning: true,
      },
    });

    expect(result).toMatchObject({
      id: 'interaction-1',
      status: 'in_progress',
      provider: 'gemini',
      agent: 'deep-research-preview-04-2026',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${baseUrl}/interactions`);
    expect(calls[0]?.init.method).toBe('POST');

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('x-goog-api-key')).toBe(apiKey);

    const body = parseBody(calls[0] as FetchCall);
    expect(body).toMatchObject({
      input: 'Research TypeScript queue patterns.',
      agent: 'deep-research-preview-04-2026',
      background: true,
      store: true,
      agent_config: {
        type: 'deep-research',
        thinking_summaries: 'auto',
        visualization: 'auto',
        collaborative_planning: true,
      },
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
      previousInteractionId: 'interaction-1',
      agentMode: 'max',
      input: [
        { type: 'text', text: 'Compare this document to current news.' },
        {
          type: 'document',
          uri: 'https://example.test/report.pdf',
          mimeType: 'application/pdf',
        },
      ],
      tools: [
        { type: 'google_search' },
        {
          type: 'mcp_server',
          name: 'Deployment Tracker',
          url: 'https://mcp.example.test/mcp',
          headers: { Authorization: 'Bearer token' },
          allowedTools: ['deployment_status'],
        },
        {
          type: 'file_search',
          fileSearchStoreNames: ['fileSearchStores/store-1'],
        },
      ],
    });

    const body = parseBody(calls[0] as FetchCall);
    expect(body).toMatchObject({
      agent: 'deep-research-max-preview-04-2026',
      previous_interaction_id: 'interaction-1',
    });
    expect(body.input).toEqual([
      { type: 'text', text: 'Compare this document to current news.' },
      {
        type: 'document',
        uri: 'https://example.test/report.pdf',
        mime_type: 'application/pdf',
      },
    ]);
    expect(body.tools).toEqual([
      { type: 'google_search' },
      {
        type: 'mcp_server',
        name: 'Deployment Tracker',
        url: 'https://mcp.example.test/mcp',
        headers: { Authorization: 'Bearer token' },
        allowed_tools: ['deployment_status'],
      },
      {
        type: 'file_search',
        file_search_store_names: ['fileSearchStores/store-1'],
      },
    ]);
  });

  it('normalizes completed research outputs', async () => {
    responses.push(
      jsonResponse({
        id: 'interaction-3',
        status: 'completed',
        outputs: [
          { type: 'text', text: 'Final report' },
          { type: 'image', data: 'base64-data', mime_type: 'image/png' },
          {
            type: 'source-url',
            id: 'source-1',
            url: 'https://example.test/source',
            title: 'Example Source',
          },
          { type: 'thought_summary', text: 'Checked source quality.' },
        ],
      })
    );

    const result = await createService().getResearch({ id: 'interaction-3' });

    expect(calls[0]?.url).toBe(`${baseUrl}/interactions/interaction-3`);
    expect(calls[0]?.init.method).toBe('GET');
    expect(result.text).toBe('Final report');
    expect(result.message).toMatchObject({
      id: 'interaction-3',
      role: 'assistant',
      metadata: {
        interactionId: 'interaction-3',
        provider: 'gemini',
        status: 'completed',
      },
    });
    expect(result.message.parts).toEqual([
      {
        type: 'text',
        text: 'Final report',
        providerMetadata: {
          gemini: { type: 'text', text: 'Final report' },
        },
      },
      {
        type: 'file',
        mediaType: 'image/png',
        url: 'data:image/png;base64,base64-data',
        providerMetadata: {
          gemini: {
            type: 'image',
            data: 'base64-data',
            mime_type: 'image/png',
          },
        },
      },
      {
        type: 'source-url',
        sourceId: 'source-1',
        url: 'https://example.test/source',
        title: 'Example Source',
        providerMetadata: {
          gemini: {
            type: 'source-url',
            id: 'source-1',
            url: 'https://example.test/source',
            title: 'Example Source',
          },
        },
      },
      {
        type: 'reasoning',
        text: 'Checked source quality.',
        state: 'done',
        providerMetadata: {
          gemini: {
            type: 'thought_summary',
            text: 'Checked source quality.',
          },
        },
      },
    ]);
  });

  it('polls until completion', async () => {
    responses.push(
      jsonResponse({ id: 'interaction-4', status: 'in_progress' }),
      jsonResponse({
        id: 'interaction-4',
        status: 'completed',
        outputs: [{ type: 'text', text: 'Done' }],
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
        id: 'interaction-5',
        status: 'failed',
        error: {
          code: 'FAILED_PRECONDITION',
          message: 'Research failed',
        },
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
          id: 'interaction-7',
          status: 'failed',
          error: {
            message: 'Invalid request',
          },
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
