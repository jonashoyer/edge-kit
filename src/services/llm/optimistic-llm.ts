import { type LanguageModel, streamObject, streamText } from 'ai';
import { z } from 'zod';
import type { JSONSchema } from 'zod/v4/core/json-schema';
import { fnv1a64B64 } from '../../utils/crypto-utils';
import { stableStringify } from '../../utils/object-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';

export interface OptimisticLlmServiceOptions {
  /**
   * TTL for a warmed prompt-prefix entry (in seconds). Default: 300s (5 minutes)
   */
  ttlSeconds?: number;
  /**
   * Key namespace for cache entries. Default: 'llm:warm'
   */
  keyNamespace?: string;
  /**
   * Minimum cached token threshold. The service will skip warming when the
   * estimated token count is below this value (unless force: true is passed).
   * Default: 1024 tokens.
   */
  minCachedTokens?: number;

  getTokenCount?: (text: string) => number;
}

/**
 * Optimistic LLM warm-up service. It records a short-lived key for a prompt-prefix and proactively
 * calls the provider with a no-op system prompt so underlying providers (e.g., OpenAI/Azure) warm their token cache.
 */
export class OptimisticLlmService {
  private readonly kv: AbstractKeyValueService;
  private readonly ttlSeconds: number;
  private readonly keyNamespace: string;
  private readonly minCachedTokens: number;
  private readonly getTokenCount: (text: string) => number;

  constructor(
    kv: AbstractKeyValueService,
    options: OptimisticLlmServiceOptions
  ) {
    this.kv = kv;
    this.ttlSeconds = options.ttlSeconds ?? 300; // 5 minutes
    this.keyNamespace = options.keyNamespace ?? 'llm:warm';
    this.minCachedTokens = options.minCachedTokens ?? 1024;
    this.getTokenCount =
      options.getTokenCount ?? this.defaultEstimateTokenCount;
  }

  /**
   * Returns true if the prompt-prefix has been warmed within the TTL window.
   */
  async isExpectedWarm(
    prefix: string,
    model: LanguageModel,
    schema?: z.ZodType
  ): Promise<boolean> {
    const key = this.buildPrefixKey(prefix, model, schema);
    return await this.kv.exists(key);
  }

  /**
   * Ensures the prompt-prefix is warmed. If not warmed within the TTL, performs a minimal provider call
   * appending an explicit user message instructing not to respond, then marks the prefix as warm.
   */
  async warmIfNeeded(
    prefix: string,
    model: LanguageModel,
    schema?: z.ZodType
  ): Promise<void> {
    const key = this.buildPrefixKey(prefix, model, schema);

    if (await this.kv.exists(key)) {
      return; // Already warm within TTL
    }

    // Estimate tokens from character length (~4 chars/token). Skip warm-up if too small unless forced.
    const estimatedTokens = this.getTokenCount(prefix);
    if (estimatedTokens < this.minCachedTokens) {
      return;
    }

    try {
      if (schema) {
        await this.warmByFirstChunk((signal) =>
          streamObject<any>({
            model,
            schema,
            system: prefix,
            maxOutputTokens: 1,
            abortSignal: signal,
          })
        );
      } else {
        await this.warmByFirstChunk((signal) =>
          streamText({
            model,
            system: prefix,
            maxOutputTokens: 1,
            abortSignal: signal,
          })
        );
      }
    } catch (err) {
      console.error(err);
    }

    // Mark as warm with TTL so subsequent real requests can skip warm-up
    await this.kv.set(key, 1, this.ttlSeconds);
  }

  /**
   * Builds a compact cache key for the prompt prefix and model.
   */
  private buildPrefixKey(
    prefix: string,
    model: LanguageModel,
    schema?: z.ZodType
  ): string {
    const hash = fnv1a64B64(prefix);
    const modelId = this.identifyModel(model);
    const modelPart = modelId ? `:${modelId}` : '';
    const schemaHash = schema
      ? this.hashSchema(z.toJSONSchema(schema))
      : undefined;
    const schemaPart = schemaHash ? `:s:${schemaHash}` : '';
    return `${this.keyNamespace}${modelPart}${schemaPart}:${hash}`;
  }

  private defaultEstimateTokenCount(text: string): number {
    // Rough heuristic: ~4 characters per token (English). Adjust as needed per workload.
    const avgCharsPerToken = 4;
    return Math.ceil(text.length / avgCharsPerToken);
  }

  /**
   * Runs a streaming call and aborts after the first chunk on the `fullStream` (or after a small timeout).
   */
  private async warmByFirstChunk<T extends { fullStream: AsyncIterable<any> }>(
    createStream: (signal: AbortSignal) => T
  ): Promise<void> {
    const abortController = new AbortController();
    try {
      const result = createStream(abortController.signal);
      await Promise.race([
        (async () => {
          try {
            for await (const _ of result.fullStream) {
              break;
            }
          } catch {
            // ignore; likely due to abort
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } finally {
      abortController.abort();
    }
  }

  /**
   * Computes a stable hash for a given Zod schema by extracting a serializable descriptor.
   * Falls back to description/constructor name if extraction fails.
   */
  private hashSchema(schema: JSONSchema): string {
    return fnv1a64B64(stableStringify(schema));
  }

  /**
   * Attempts to derive a deterministic identifier for an AI SDK LanguageModel.
   */
  private identifyModel(model: LanguageModel): string | undefined {
    if (!model) return;
    if (typeof model === 'string') return model;
    return [model.provider, model.modelId].filter(Boolean).join(':');
  }
}
