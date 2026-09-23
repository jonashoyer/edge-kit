import type { LanguageModel } from 'ai';
import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  createAiProviderProbe,
  runHealthProbe,
  runHealthProbeSuite,
} from './health-probe';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

describe('health probes', () => {
  it('captures successful probe results with latency and metadata', async () => {
    const result = await runHealthProbe({
      name: 'probe.ok',
      async run() {
        return {
          meta: {
            ok: true,
          },
        };
      },
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.meta).toEqual({ ok: true });
  });

  it('captures probe failures', async () => {
    const result = await runHealthProbe({
      name: 'probe.fail',
      async run() {
        throw new Error('boom');
      },
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('converts timeouts into failed probe results', async () => {
    const result = await runHealthProbe({
      name: 'probe.timeout',
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
      timeoutMs: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('aggregates suites', async () => {
    const result = await runHealthProbeSuite({
      probes: [
        {
          name: 'probe.ok',
          async run() {},
          timeoutMs: 1000,
        },
        {
          name: 'probe.fail',
          async run() {
            throw new Error('boom');
          },
          timeoutMs: 1000,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.probes).toHaveLength(2);
    expect(result.startedAt).toBeLessThanOrEqual(result.finishedAt);
  });

  it('creates AI provider probes with default validation', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      response: {
        modelId: 'test-model',
      },
      text: 'OK',
    } as never);

    const result = await runHealthProbe(
      createAiProviderProbe({
        model: 'test-model' as unknown as LanguageModel,
        name: 'ai.ok',
        timeoutMs: 1000,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.meta).toEqual({
      output: 'OK',
      responseModelId: 'test-model',
    });
  });

  it('fails AI provider probes on empty output', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      response: {
        modelId: 'test-model',
      },
      text: '   ',
    } as never);

    const result = await runHealthProbe(
      createAiProviderProbe({
        model: 'test-model' as unknown as LanguageModel,
        name: 'ai.empty',
        timeoutMs: 1000,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('empty response');
  });
});
