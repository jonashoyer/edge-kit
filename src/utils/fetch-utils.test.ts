/** biome-ignore-all lint/suspicious/useAwait: test code */
import { describe, expect, expectTypeOf, it, test, vi } from 'vitest';
import { z } from 'zod';

import type {
  FetchExtExpectBlobOptions,
  FetchExtExpectJsonOptions,
  FetchExtExpectTextOptions,
  FetchExtJsonResult,
} from './fetch-utils';
import { fetchExt } from './fetch-utils';

// https://httpbin.org/status/{http_status_code}

describe('fetchExt', () => {
  it('stringifies object body and sets content-type if missing', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.body).toBe(JSON.stringify({ a: 1 }));
      expect(headers.get('content-type')).toBe('application/json');
      return new Response('{}', { status: 200 });
    });

    // @ts-expect-error - mocked for test
    globalThis.fetch = fetchMock;

    const res = await fetchExt({
      url: 'https://example.com',
      init: { method: 'POST', body: { a: 1 } },
    });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns parsed+validated JSON when expectJson.schema is provided', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const schema = z.object({ ok: z.boolean() });
    const { response, data } = await fetchExt({
      url: 'https://example.com',
      expectJson: { schema },
    });

    expect(response.ok).toBe(true);
    expect(data.ok).toBe(true);
  });

  it('throws FETCH_INVALID_JSON for non-JSON bodies when expectJson is enabled', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('not-json', { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const schema = z.object({ ok: z.boolean() });

    await expect(
      fetchExt({ url: 'https://example.com', expectJson: { schema } })
    ).rejects.toMatchObject({ code: 'FETCH_INVALID_JSON' });
  });

  it('throws FETCH_SCHEMA_VALIDATION when schema validation fails', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: 'nope' }), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const schema = z.object({ ok: z.boolean() });

    await expect(
      fetchExt({ url: 'https://example.com', expectJson: { schema } })
    ).rejects.toMatchObject({ code: 'FETCH_SCHEMA_VALIDATION' });
  });

  it('throws FETCH_TIMEOUT when request exceeds timeout', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    // @ts-expect-error - mocked for test
    globalThis.fetch = fetchMock;

    try {
      const promise = fetchExt({ url: 'https://example.com', timeout: 5 });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'FETCH_TIMEOUT',
      });

      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries on network errors and calls onRetry', async () => {
    vi.useFakeTimers();

    const onRetry = vi.fn();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    globalThis.fetch = fetchMock;

    try {
      const promise = fetchExt({
        url: 'https://example.com',
        retries: 1,
        retryDelay: 50,
        backoff: 'none',
        onRetry,
      });

      await vi.runAllTimersAsync();
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'error',
          delayMs: 50,
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries on configured HTTP statuses, caps wait time, and calls onRetry', async () => {
    vi.useFakeTimers();

    const onRetry = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate-limited', {
          status: 429,
          headers: { 'retry-after': '10' },
        })
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    globalThis.fetch = fetchMock;

    try {
      const promise = fetchExt({
        url: 'https://example.com',
        retries: 1,
        retryOnHttpStatuses: [429],
        retryDelay: 50,
        backoff: 'none',
        maxRetryWaitMs: 20,
        onRetry,
      });

      await vi.runAllTimersAsync();
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'http_status',
          status: 429,
          delayMs: 20,
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds Idempotency-Key header when enabled', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const idempotencyKey = headers.get('Idempotency-Key');
      expect(typeof idempotencyKey).toBe('string');
      expect(idempotencyKey?.length).toBe(20);
      return new Response('ok', { status: 200 });
    });

    // @ts-expect-error - mocked for test
    globalThis.fetch = fetchMock;

    const res = await fetchExt({
      url: 'https://example.com',
      idempotencyKey: true,
      init: { method: 'POST' },
    });

    expect(res.ok).toBe(true);
  });

  it('does not add Idempotency-Key header by default', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('Idempotency-Key')).toBe(false);
      return new Response('ok', { status: 200 });
    });

    // @ts-expect-error - mocked for test
    globalThis.fetch = fetchMock;

    const res = await fetchExt({
      url: 'https://example.com',
      init: { method: 'POST' },
    });

    expect(res.ok).toBe(true);
  });

  it('does not add Idempotency-Key header when idempotencyKey is false', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('Idempotency-Key')).toBe(false);
      return new Response('ok', { status: 200 });
    });

    // @ts-expect-error - mocked for test
    globalThis.fetch = fetchMock;

    const res = await fetchExt({
      url: 'https://example.com',
      idempotencyKey: false,
      init: { method: 'POST' },
    });

    expect(res.ok).toBe(true);
  });

  it('throws FETCH_HTTP_ERROR when throwOnHttpError is enabled', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('nope', { status: 500, statusText: 'Nope' });
    });

    globalThis.fetch = fetchMock;

    await expect(
      fetchExt({
        url: 'https://example.com',
        throwOnHttpError: true,
      })
    ).rejects.toMatchObject({ code: 'FETCH_HTTP_ERROR', status: 500 });
  });

  it('applies jitter to retry delays when enabled', async () => {
    vi.useFakeTimers();

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onRetry = vi.fn();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate-limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    globalThis.fetch = fetchMock;

    try {
      const promise = fetchExt({
        url: 'https://example.com',
        retries: 1,
        retryOnHttpStatuses: [429],
        retryDelay: 100,
        backoff: 'none',
        respectRetryAfter: false,
        jitter: true,
        onRetry,
      });

      await vi.runAllTimersAsync();
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ delayMs: 50, reason: 'http_status' })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('supports expectText', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('hello', { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const { response, data } = await fetchExt({
      url: 'https://example.com',
      expectText: true,
    });

    expect(response.ok).toBe(true);
    expect(data).toBe('hello');
  });

  it('supports expectBlob', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(new Blob(['abc']), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const { response, data } = await fetchExt({
      url: 'https://example.com',
      expectBlob: true,
    });

    expect(response.ok).toBe(true);
    expect(await data.text()).toBe('abc');
  });
});

test('fetchExt types: overloads and parameter are not any', () => {
  expectTypeOf(fetchExt).parameter(0).not.toBeAny();

  type ExpectTextSig = (
    options: FetchExtExpectTextOptions & { url: string }
  ) => Promise<{ response: Response; data: string }>;
  const expectTextSig: ExpectTextSig = fetchExt;
  expectTypeOf(expectTextSig).returns.toEqualTypeOf<
    Promise<{ response: Response; data: string }>
  >();

  type ExpectBlobSig = (
    options: FetchExtExpectBlobOptions & { url: string }
  ) => Promise<{ response: Response; data: Blob }>;
  const expectBlobSig: ExpectBlobSig = fetchExt;
  expectTypeOf(expectBlobSig).returns.toEqualTypeOf<
    Promise<{ response: Response; data: Blob }>
  >();

  type OkShape = { ok: boolean };
  type ExpectJsonSig = (
    options: FetchExtExpectJsonOptions<OkShape> & { url: string }
  ) => Promise<FetchExtJsonResult<OkShape>>;
  const expectJsonSig: ExpectJsonSig = fetchExt;
  expectTypeOf(expectJsonSig).returns.toEqualTypeOf<
    Promise<FetchExtJsonResult<OkShape>>
  >();
});
