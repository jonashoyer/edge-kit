import { generateText, type LanguageModel } from 'ai';

export interface HealthProbeResult {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface HealthProbeDefinition {
  name: string;
  timeoutMs: number;
  run: () => Promise<{ meta?: Record<string, unknown> } | void>;
}

export interface HealthProbeSuiteResult {
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  probes: HealthProbeResult[];
}

export interface AiProviderProbeOptions {
  name: string;
  model: LanguageModel;
  timeoutMs: number;
  prompt?: string;
  maxOutputTokens?: number;
  validate?: (args: {
    text: string;
    responseModelId?: string;
  }) => Record<string, unknown> | void;
}

const createTimeoutError = (name: string, timeoutMs: number) =>
  new Error(`${name} timed out after ${timeoutMs}ms`);

const runWithTimeout = async <T>(
  name: string,
  timeoutMs: number,
  run: () => Promise<T>
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run(),
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError(name, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const runHealthProbe = async (
  probe: HealthProbeDefinition
): Promise<HealthProbeResult> => {
  const startedAt = Date.now();

  try {
    const result = await runWithTimeout(probe.name, probe.timeoutMs, probe.run);
    return {
      name: probe.name,
      ok: true,
      latencyMs: Date.now() - startedAt,
      meta: result && 'meta' in result ? result.meta : undefined,
    };
  } catch (error) {
    return {
      name: probe.name,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const runHealthProbeSuite = async (input: {
  probes: HealthProbeDefinition[];
}): Promise<HealthProbeSuiteResult> => {
  const startedAt = Date.now();
  const probes = await Promise.all(
    input.probes.map(async (probe) => await runHealthProbe(probe))
  );
  const finishedAt = Date.now();

  return {
    ok: probes.every((probe) => probe.ok),
    startedAt,
    finishedAt,
    probes,
  };
};

export const createAiProviderProbe = (
  options: AiProviderProbeOptions
): HealthProbeDefinition => {
  const prompt = options.prompt ?? 'Reply OK';
  const maxOutputTokens = options.maxOutputTokens ?? 1;

  return {
    name: options.name,
    timeoutMs: options.timeoutMs,
    run: async () => {
      const result = await generateText({
        model: options.model,
        prompt,
        maxOutputTokens,
      });

      const text = result.text.trim();
      if (!text) {
        throw new Error(
          'Expected model output text but received an empty response'
        );
      }

      const meta = options.validate
        ? options.validate({
            text,
            responseModelId: result.response.modelId,
          })
        : {
            output: text,
            responseModelId: result.response.modelId,
          };

      if (meta === undefined) {
        return;
      }

      return { meta };
    },
  };
};
