import { fnv1a64B64 } from '../../utils/crypto-utils';
import { stableStringify } from '../../utils/object-utils';
import { AbstractKeyValueService } from '../key-value/abstract-key-value';

export interface ContextPageResult<TItem> {
  items: TItem[];
  nextCursor?: string;
}

export interface ContextProvider<TParams = unknown, TItem = unknown> {
  readonly id: string;
  fetch(params: TParams): Promise<ContextPageResult<TItem>>;
  render(item: TItem): string;
  renderPage?(result: ContextPageResult<TItem>): string;
  getCacheKey?(params: TParams): string;
}

export type ProviderRegistry = Record<string, ContextProvider>;

export type ProviderParams<T> =
  T extends ContextProvider<infer TParams, unknown> ? TParams : never;

export type ProviderPageResult<T> =
  T extends ContextProvider<unknown, infer TItem>
    ? ContextPageResult<TItem>
    : never;

export type ParamsFor<
  TRegistry extends ProviderRegistry,
  TKey extends keyof TRegistry,
> = ProviderParams<TRegistry[TKey]>;

export type ResultFor<
  TRegistry extends ProviderRegistry,
  TKey extends keyof TRegistry,
> = ProviderPageResult<TRegistry[TKey]>;

export type ContextFetchRequest<TProviders extends ProviderRegistry> = {
  [TKey in keyof TProviders]?: ParamsFor<TProviders, TKey>;
};

export type ContextFetchResult<
  TProviders extends ProviderRegistry,
  TRequest extends ContextFetchRequest<TProviders>,
> = {
  [TKey in keyof TRequest & keyof TProviders]: ResultFor<TProviders, TKey>;
};

export type ContextRenderResult<
  TProviders extends ProviderRegistry,
  TRequest extends ContextFetchRequest<TProviders>,
> = {
  [TKey in keyof TRequest & keyof TProviders]: string;
};

export interface ContextualizerOptions {
  kv?: AbstractKeyValueService;
  keyNamespace?: string;
  ttlSeconds?: number;
  buildCacheKey?: (providerId: string, params: unknown) => string;
}

export interface ContextFetchOptions {
  bypassCache?: boolean;
  ttlSeconds?: number;
}

const DEFAULT_KEY_NAMESPACE = 'context';
const DEFAULT_TTL_SECONDS = 3600;

const sanitizeCacheKeyValue = (value: unknown): unknown => {
  if (value === undefined || value === null) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [
        String(key),
        sanitizeCacheKeyValue(entry),
      ])
    );
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((entry) =>
      sanitizeCacheKeyValue(entry)
    );
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeCacheKeyValue(entry));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = sanitizeCacheKeyValue(entry);
    }
    return sanitized;
  }

  return String(value);
};

const buildDefaultCacheKey = (providerId: string, params: unknown): string => {
  const serialized = stableStringify(sanitizeCacheKeyValue(params));
  return `${providerId}:${fnv1a64B64(serialized)}`;
};

export class Contextualizer<TProviders extends ProviderRegistry> {
  private readonly providers: TProviders;
  private readonly kv?: AbstractKeyValueService;
  private readonly keyNamespace: string;
  private readonly ttlSeconds: number;
  private readonly buildCacheKey: (
    providerId: string,
    params: unknown
  ) => string;

  constructor(providers: TProviders, options: ContextualizerOptions = {}) {
    this.providers = providers;
    this.kv = options.kv;
    this.keyNamespace = options.keyNamespace ?? DEFAULT_KEY_NAMESPACE;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.buildCacheKey = options.buildCacheKey ?? buildDefaultCacheKey;
  }

  provider<TKey extends keyof TProviders>(key: TKey): TProviders[TKey] {
    const provider = this.providers[key];
    if (!provider) {
      throw new Error(`Unknown context provider: ${String(key)}`);
    }

    return provider;
  }

  listProviders(): Array<keyof TProviders> {
    return Object.keys(this.providers) as Array<keyof TProviders>;
  }

  async fetch<TRequest extends ContextFetchRequest<TProviders>>(
    request: TRequest,
    options: ContextFetchOptions = {}
  ): Promise<ContextFetchResult<TProviders, TRequest> & { request: TRequest }> {
    const keys = Object.keys(request) as Array<
      keyof TRequest & keyof TProviders
    >;
    const result = {} as ContextFetchResult<TProviders, TRequest>;

    await Promise.all(
      keys.map(async (key) => {
        const params = request[key];
        result[key] = await this.fetchProvider(
          key,
          params as ParamsFor<TProviders, typeof key>,
          options
        );
      })
    );

    return { ...result, request };
  }

  async fetchProvider<TKey extends keyof TProviders>(
    key: TKey,
    params: ParamsFor<TProviders, TKey>,
    options: ContextFetchOptions = {}
  ): Promise<ResultFor<TProviders, TKey>> {
    const provider = this.provider(key);
    const cacheKey = this.getProviderCacheKey(provider, params);
    const withCache = this.kv
      ? this.kv.withCache.bind(this.kv)
      : AbstractKeyValueService.noopWithCache;

    const result = await withCache(
      cacheKey,
      async () => await provider.fetch(params),
      {
        bypassCache: options.bypassCache,
        ttlSeconds: options.ttlSeconds ?? this.ttlSeconds,
      }
    );

    return result as ResultFor<TProviders, TKey>;
  }

  renderProvider<TKey extends keyof TProviders>(
    key: TKey,
    result: ResultFor<TProviders, TKey>
  ): string {
    const provider = this.provider(key);

    if (provider.renderPage) {
      return provider.renderPage(result);
    }

    return result.items.map((item) => provider.render(item)).join('\n\n');
  }

  async fetchAndRender<TRequest extends ContextFetchRequest<TProviders>>(
    request: TRequest,
    options: ContextFetchOptions = {}
  ): Promise<{
    data: ContextFetchResult<TProviders, TRequest>;
    rendered: ContextRenderResult<TProviders, TRequest>;
    request: TRequest;
  }> {
    const fetched = await this.fetch(request, options);
    const data = {} as ContextFetchResult<TProviders, TRequest>;
    const keys = Object.keys(request) as Array<
      keyof TRequest & keyof TProviders
    >;
    const rendered = {} as ContextRenderResult<TProviders, TRequest>;

    for (const key of keys) {
      data[key] = fetched[key];
      rendered[key] = this.renderProvider(
        key,
        fetched[key] as ResultFor<TProviders, typeof key>
      );
    }

    return {
      data,
      rendered,
      request: fetched.request,
    };
  }

  private getProviderCacheKey(
    provider: ContextProvider,
    params: unknown
  ): string {
    const providerKey = provider.getCacheKey
      ? provider.getCacheKey(params)
      : this.buildCacheKey(provider.id, params);

    return `${this.keyNamespace}:${provider.id}:${providerKey}`;
  }
}
