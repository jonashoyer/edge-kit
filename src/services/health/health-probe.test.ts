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
      timeoutMs: 1000,
      async run() {
        return {
          meta: {
            ok: true,
          },
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.meta).toEqual({ ok: true });
  });

  it('captures probe failures', async () => {
    const result = await runHealthProbe({
      name: 'probe.fail',
      timeoutMs: 1000,
      async run() {
        throw new Error('boom');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('converts timeouts into failed probe results', async () => {
    const result = await runHealthProbe({
      name: 'probe.timeout',
      timeoutMs: 10,
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('aggregates suites', async () => {
    const result = await runHealthProbeSuite({
      probes: [
        {
          name: 'probe.ok',
          timeoutMs: 1000,
          async run() {
            return;
          },
        },
        {
          name: 'probe.fail',
          timeoutMs: 1000,
          async run() {
            throw new Error('boom');
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.probes).toHaveLength(2);
    expect(result.startedAt).toBeLessThanOrEqual(result.finishedAt);
  });

  it('creates AI provider probes with default validation', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'OK',
      response: {
        modelId: 'test-model',
      },
    } as never);

    const result = await runHealthProbe(
      createAiProviderProbe({
        name: 'ai.ok',
        model: 'test-model' as unknown as LanguageModel,
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
      text: '   ',
      response: {
        modelId: 'test-model',
      },
    } as never);

    const result = await runHealthProbe(
      createAiProviderProbe({
        name: 'ai.empty',
        model: 'test-model' as unknown as LanguageModel,
        timeoutMs: 1000,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('empty response');
  });
});
