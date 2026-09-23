import { generateText, type LanguageModel } from 'ai';

export interface HealthProbeResult {
  error?: string;
  latencyMs: number;
  meta?: Record<string, unknown>;
  name: string;
  ok: boolean;
}

export interface HealthProbeDefinition {
  name: string;
  // biome-ignore lint/suspicious/noConfusingVoidType: Callbacks may intentionally return no result, including Promise<void>.
  run: () => Promise<{ meta?: Record<string, unknown> } | void>;
  timeoutMs: number;
}

export interface HealthProbeSuiteResult {
  finishedAt: number;
  ok: boolean;
  probes: HealthProbeResult[];
  startedAt: number;
}

export interface AiProviderProbeOptions {
  maxOutputTokens?: number;
  model: LanguageModel;
  name: string;
  prompt?: string;
  timeoutMs: number;
  validate?: (args: {
    text: string;
    responseModelId?: string;
    // biome-ignore lint/suspicious/noConfusingVoidType: Validators may only throw on failure and return no metadata.
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
      latencyMs: Date.now() - startedAt,
      meta: result && 'meta' in result ? result.meta : undefined,
      name: probe.name,
      ok: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      name: probe.name,
      ok: false,
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
    finishedAt,
    ok: probes.every((probe) => probe.ok),
    probes,
    startedAt,
  };
};

export const createAiProviderProbe = (
  options: AiProviderProbeOptions
): HealthProbeDefinition => {
  const prompt = options.prompt ?? 'Reply OK';
  const maxOutputTokens = options.maxOutputTokens ?? 1;

  return {
    name: options.name,
    run: async () => {
      const result = await generateText({
        maxOutputTokens,
        model: options.model,
        prompt,
      });

      const text = result.text.trim();
      if (!text) {
        throw new Error(
          'Expected model output text but received an empty response'
        );
      }

      const meta = options.validate
        ? options.validate({
            responseModelId: result.response.modelId,
            text,
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
    timeoutMs: options.timeoutMs,
  };
};
