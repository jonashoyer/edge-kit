import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from 'ai';
import { fnv1a64B64 } from '../../utils/crypto-utils';
import { stableStringify } from '../../utils/object-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import type { AbstractLogger } from '../logging/abstract-logger';

interface CacheEntry<Params = unknown, Result = unknown> {
  params: Params;
  result: Result;
}

interface MemoryCacheEntry<Params, Result> extends CacheEntry<Params, Result> {
  expiresAt: number | null;
}

type WrapGenerate = NonNullable<LanguageModelMiddleware['wrapGenerate']>;
type WrapGenerateArgs = Parameters<WrapGenerate>[0];
type GenerateParams = WrapGenerateArgs['params'];
type GenerateResult = Awaited<ReturnType<WrapGenerateArgs['doGenerate']>>;
type LanguageModel = WrapGenerateArgs['model'];
type CachedGenerateParams = Omit<GenerateParams, 'abortSignal' | 'headers'>;
type LlmCacheEntry = CacheEntry<CachedGenerateParams, GenerateResult>;

type WrapEmbed = NonNullable<EmbeddingModelMiddleware['wrapEmbed']>;
type WrapEmbedArgs = Parameters<WrapEmbed>[0];
type EmbedParams = WrapEmbedArgs['params'];
type EmbedResult = Awaited<ReturnType<WrapEmbedArgs['doEmbed']>>;
type EmbeddingModel = WrapEmbedArgs['model'];
type CachedEmbedParams = Omit<EmbedParams, 'abortSignal' | 'headers'>;
type EmbeddingCacheEntry = CacheEntry<CachedEmbedParams, EmbedResult>;

type CacheKeyInput =
  | {
      kind: 'generate';
      model: LanguageModel;
      params: CachedGenerateParams;
    }
  | {
      kind: 'embed';
      model: EmbeddingModel;
      params: CachedEmbedParams;
    };

export interface AiCacheOptions {
  /**
   * Namespace for all cache keys. Default: "ai:cache".
   */
  keyNamespace?: string;
  /**
   * TTL in seconds for cached entries. If omitted, entries do not expire.
   */
  ttlSeconds?: number;
  /**
   * Optional persistent cache store (KV, Redis, etc.).
   */
  kv?: AbstractKeyValueService;
  /**
   * Optional logger for cache read/write failures.
   */
  logger?: AbstractLogger;
  /**
   * Override the cache key builder for custom key strategies.
   */
  buildCacheKey?: (input: CacheKeyInput) => string;
  /**
   * Decide whether to cache a given request.
   */
  shouldCache?: (input: CacheKeyInput) => boolean;
}

const DEFAULT_KEY_NAMESPACE = 'ai:cache';

const stripGenerateParams = (params: GenerateParams): CachedGenerateParams => {
  const { abortSignal, headers, ...rest } = params;
  return rest;
};

const stripEmbedParams = (params: EmbedParams): CachedEmbedParams => {
  const { abortSignal, headers, ...rest } = params;
  return rest;
};

const identifyModel = (model: unknown): string | undefined => {
  if (!model) {
    return;
  }

  if (typeof model === 'string') {
    return model;
  }

  if (typeof model !== 'object') {
    return;
  }

  const record = model as Record<string, unknown>;
  const provider = typeof record.provider === 'string' ? record.provider : '';
  const modelId = typeof record.modelId === 'string' ? record.modelId : '';
  const parts = [provider, modelId].filter(Boolean);

  return parts.length > 0 ? parts.join(':') : undefined;
};

const isAbortSignal = (value: unknown): value is AbortSignal => {
  if (typeof AbortSignal === 'undefined') {
    return false;
  }

  return value instanceof AbortSignal;
};

const sanitizeForCache = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    return value;
  }

  if (valueType === 'bigint') {
    return value.toString();
  }

  if (valueType === 'symbol' || valueType === 'function') {
    return;
  }

  if (isAbortSignal(value)) {
    return;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }

  if (value instanceof Map) {
    const entries: Array<[unknown, unknown]> = [];
    for (const [key, entry] of value.entries()) {
      entries.push([
        sanitizeForCache(key, seen),
        sanitizeForCache(entry, seen),
      ]);
    }
    return entries;
  }

  if (value instanceof Set) {
    const entries: Array<unknown> = [];
    for (const entry of value.values()) {
      entries.push(sanitizeForCache(entry, seen));
    }
    return entries;
  }

  if (typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    const items: Array<unknown> = [];
    for (const entry of value) {
      items.push(sanitizeForCache(entry, seen));
    }
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = sanitizeForCache(entry, seen);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }

  return result;
};

const serializeCachePayload = (payload: unknown): string => {
  const sanitized = sanitizeForCache(payload, new WeakSet());
  return stableStringify(sanitized);
};

const buildDefaultCacheKey = (input: CacheKeyInput, keyNamespace: string) => {
  const modelId = identifyModel(input.model);
  const serialized = serializeCachePayload({
    kind: input.kind,
    model: modelId,
    params: input.params,
  });
  const hash = fnv1a64B64(serialized);
  return `${keyNamespace}:${input.kind}:${hash}`;
};

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return;
};

const normalizeGenerateResult = (result: GenerateResult): GenerateResult => {
  if (!result.response || typeof result.response !== 'object') {
    return result;
  }

  const response = result.response as Record<string, unknown>;
  const timestamp = toDate(response.timestamp);
  if (!timestamp) {
    return result;
  }

  return {
    ...result,
    response: {
      ...response,
      timestamp,
    },
  } as GenerateResult;
};

const resolveMemoryEntry = <Params, Result>(
  cache: Map<string, MemoryCacheEntry<Params, Result>>,
  key: string
): MemoryCacheEntry<Params, Result> | undefined => {
  const entry = cache.get(key);
  if (!entry) {
    return;
  }

  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    cache.delete(key);
    return;
  }

  return entry;
};

const buildMemoryEntry = <Params, Result>(
  entry: CacheEntry<Params, Result>,
  ttlSeconds?: number
): MemoryCacheEntry<Params, Result> => {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  return { ...entry, expiresAt };
};

/**
 * Creates a caching middleware for language model calls (generate).
 * Uses in-memory caching for fast reuse and an optional persistent store.
 */
export function createLlmCachingMiddleware(
  options: AiCacheOptions = {}
): LanguageModelMiddleware {
  const {
    keyNamespace = DEFAULT_KEY_NAMESPACE,
    ttlSeconds,
    kv: cacheStore,
    logger,
    buildCacheKey,
    shouldCache,
  } = options;

  const memoryCache = new Map<
    string,
    MemoryCacheEntry<CachedGenerateParams, GenerateResult>
  >();

  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const sanitizedParams = stripGenerateParams(params);
      const keyInput: CacheKeyInput = {
        kind: 'generate',
        model,
        params: sanitizedParams,
      };

      if (shouldCache && !shouldCache(keyInput)) {
        return await doGenerate();
      }

      const cacheKey = buildCacheKey
        ? buildCacheKey(keyInput)
        : buildDefaultCacheKey(keyInput, keyNamespace);

      const memoryEntry = resolveMemoryEntry(memoryCache, cacheKey);
      if (memoryEntry) {
        return normalizeGenerateResult(memoryEntry.result);
      }

      if (cacheStore) {
        try {
          const stored = await cacheStore.get<LlmCacheEntry>(cacheKey);
          if (stored) {
            const normalized = normalizeGenerateResult(stored.result);
            memoryCache.set(
              cacheKey,
              buildMemoryEntry(
                { params: stored.params, result: normalized },
                ttlSeconds
              )
            );
            return normalized;
          }
        } catch (error) {
          logger?.error('Failed to read LLM cache entry', { error });
        }
      }

      const result = await doGenerate();
      const entry: LlmCacheEntry = { params: sanitizedParams, result };
      memoryCache.set(cacheKey, buildMemoryEntry(entry, ttlSeconds));

      if (cacheStore) {
        try {
          await cacheStore.set(cacheKey, entry, ttlSeconds);
        } catch (error) {
          logger?.error('Failed to write LLM cache entry', { error });
        }
      }

      return result;
    },
  };
}

/**
 * Creates a caching middleware for embedding model calls.
 * Uses in-memory caching for fast reuse and an optional persistent store.
 */
export function createEmbeddingCachingMiddleware(
  options: AiCacheOptions = {}
): EmbeddingModelMiddleware {
  const {
    keyNamespace = DEFAULT_KEY_NAMESPACE,
    ttlSeconds,
    kv: cacheStore,
    logger,
    buildCacheKey,
    shouldCache,
  } = options;

  const memoryCache = new Map<
    string,
    MemoryCacheEntry<CachedEmbedParams, EmbedResult>
  >();

  return {
    specificationVersion: 'v3',
    wrapEmbed: async ({ doEmbed, params, model }) => {
      const sanitizedParams = stripEmbedParams(params);
      const keyInput: CacheKeyInput = {
        kind: 'embed',
        model,
        params: sanitizedParams,
      };

      if (shouldCache && !shouldCache(keyInput)) {
        return await doEmbed();
      }

      const cacheKey = buildCacheKey
        ? buildCacheKey(keyInput)
        : buildDefaultCacheKey(keyInput, keyNamespace);

      const memoryEntry = resolveMemoryEntry(memoryCache, cacheKey);
      if (memoryEntry) {
        return memoryEntry.result;
      }

      if (cacheStore) {
        try {
          const stored = await cacheStore.get<EmbeddingCacheEntry>(cacheKey);
          if (stored) {
            memoryCache.set(
              cacheKey,
              buildMemoryEntry(
                { params: stored.params, result: stored.result },
                ttlSeconds
              )
            );
            return stored.result;
          }
        } catch (error) {
          logger?.error('Failed to read embedding cache entry', { error });
        }
      }

      const result = await doEmbed();
      const entry: EmbeddingCacheEntry = { params: sanitizedParams, result };
      memoryCache.set(cacheKey, buildMemoryEntry(entry, ttlSeconds));

      if (cacheStore) {
        try {
          await cacheStore.set(cacheKey, entry, ttlSeconds);
        } catch (error) {
          logger?.error('Failed to write embedding cache entry', { error });
        }
      }

      return result;
    },
  };
}
