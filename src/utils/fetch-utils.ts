import type { ZodIssue, ZodType } from "zod";

import { CustomError } from "./custom-error";
import { genId } from "./id-generator";

/**
 * Extended fetch wrapper (`fetchExt`) with built-in resilience and convenience features.
 * Supports retries (with backoff/jitter), timeouts, typed JSON responses (via Zod),
 * idempotency keys, and detailed error types.
 */
export class FetchExtTimeoutError extends CustomError<"FETCH_TIMEOUT"> {
  readonly url: string;
  readonly timeoutMs: number;
  readonly attempt: number;

  constructor(args: { url: string; timeoutMs: number; attempt: number }) {
    super(
      `Fetch request timed out after ${args.timeoutMs}ms (attempt ${args.attempt})`,
      "FETCH_TIMEOUT"
    );
    this.url = args.url;
    this.timeoutMs = args.timeoutMs;
    this.attempt = args.attempt;
  }
}

export class FetchExtHttpError extends CustomError<"FETCH_HTTP_ERROR"> {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;

  constructor(args: {
    url: string;
    status: number;
    statusText: string;
    message?: string;
  }) {
    super(
      args.message ??
        `Fetch failed with HTTP ${args.status} ${args.statusText}`,
      "FETCH_HTTP_ERROR"
    );
    this.url = args.url;
    this.status = args.status;
    this.statusText = args.statusText;
  }
}

export class FetchExtNetworkError extends CustomError<"FETCH_NETWORK_ERROR"> {
  readonly url: string;
  readonly cause: unknown;

  constructor(args: { url: string; cause: unknown }) {
    super("Fetch failed due to a network error", "FETCH_NETWORK_ERROR");
    this.url = args.url;
    this.cause = args.cause;
  }
}

export class FetchExtRetriesExhaustedError extends CustomError<"FETCH_RETRIES_EXHAUSTED"> {
  readonly url: string;
  readonly retries: number;
  readonly cause: unknown;

  constructor(args: { url: string; retries: number; cause: unknown }) {
    super(
      `Fetch failed after ${args.retries + 1} attempt(s)`,
      "FETCH_RETRIES_EXHAUSTED"
    );
    this.url = args.url;
    this.retries = args.retries;
    this.cause = args.cause;
  }
}

export class FetchExtInvalidJsonError extends CustomError<"FETCH_INVALID_JSON"> {
  readonly url: string;
  readonly status: number;
  readonly bodyTextSnippet: string;
  readonly cause: unknown;

  constructor(args: {
    url: string;
    status: number;
    bodyTextSnippet: string;
    cause: unknown;
  }) {
    super("Fetch response was not valid JSON", "FETCH_INVALID_JSON");
    this.url = args.url;
    this.status = args.status;
    this.bodyTextSnippet = args.bodyTextSnippet;
    this.cause = args.cause;
  }
}

export class FetchExtSchemaValidationError extends CustomError<"FETCH_SCHEMA_VALIDATION"> {
  readonly url: string;
  readonly status: number;
  readonly issues: readonly ZodIssue[];

  constructor(args: {
    url: string;
    status: number;
    issues: readonly ZodIssue[];
  }) {
    super(
      "Fetch JSON response failed schema validation",
      "FETCH_SCHEMA_VALIDATION"
    );
    this.url = args.url;
    this.status = args.status;
    this.issues = args.issues;
  }
}

type JsonBody = Record<string, unknown> | unknown[];

export interface FetchExtOptionsBase {
  url: string;
  init?: Omit<RequestInit, "body"> & { body?: RequestInit["body"] | JsonBody };
  /**
   * Timeout (ms) for a single attempt.
   * @default 10000
   */
  timeout?: number;
  /**
   * Number of retries (not attempts). Total attempts = retries + 1.
   * @default 0
   */
  retries?: number;
  /**
   * Base delay (ms) before retrying.
   * @default 500
   */
  retryDelay?: number;
  /**
   * Backoff strategy applied to `retryDelay`.
   * @default "exponential"
   */
  backoff?: "exponential" | "none";
  /**
   * Retry on HTTP status codes (e.g. [429, 503]). Default: no HTTP-status retries.
   */
  retryOnHttpStatuses?: number[];
  /**
   * Caps the wait time between retries (for both backoff and Retry-After).
   */
  maxRetryWaitMs?: number;
  /**
   * Applies jitter to retry delays to reduce thundering-herd retries.
   * Uses "full jitter": random value in [0, delayMs).
   * @default false
   */
  jitter?: boolean;
  /**
   * When true, uses `Retry-After` header (seconds or HTTP-date) to influence retry delays.
   * Only applies when `retryOnHttpStatuses` triggers a retry.
   *
   * Default: true
   */
  respectRetryAfter?: boolean;
  /**
   * Throw when `response.ok === false`. Default: false (backwards compatible).
   */
  throwOnHttpError?: boolean;
  /**
   * Adds idempotency header to the request.
   * - string: use as provided
   * - true: auto-generate via `genId()`
   * - false: disable idempotency header injection
   *
   * Default: false
   */
  idempotencyKey?: string | boolean;
  /**
   * Header name for idempotency key. Default: `Idempotency-Key`.
   */
  idempotencyHeaderName?: string;
  /**
   * Called before waiting and retrying.
   * This callback is fire-and-forget; errors are ignored.
   */
  onRetry?: (ctx: {
    url: string;
    attempt: number;
    retries: number;
    delayMs: number;
    reason: "http_status" | "timeout" | "error";
    status?: number;
    error?: unknown;
  }) => void | Promise<void>;
}

export interface FetchExtExpectJsonOptions<T> extends FetchExtOptionsBase {
  expectJson: {
    schema: ZodType<T>;
  };
}

export interface FetchExtExpectTextOptions extends FetchExtOptionsBase {
  expectText: true;
}

export interface FetchExtExpectBlobOptions extends FetchExtOptionsBase {
  expectBlob: true;
}

export type FetchExtJsonResult<T> = {
  response: Response;
  data: T;
};

export type FetchExtError =
  | FetchExtTimeoutError
  | FetchExtHttpError
  | FetchExtNetworkError
  | FetchExtRetriesExhaustedError
  | FetchExtInvalidJsonError
  | FetchExtSchemaValidationError;

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const callOnRetry = (
  onRetry: FetchExtOptionsBase["onRetry"],
  ctx: Parameters<NonNullable<FetchExtOptionsBase["onRetry"]>>[0]
): void => {
  if (!onRetry) return;
  Promise.resolve(onRetry(ctx)).catch(() => {});
};

const isJsonBody = (body: unknown): body is JsonBody => {
  if (body === null || body === undefined) return false;
  if (typeof body !== "object") return false;
  if (body instanceof ArrayBuffer) return false;
  if (body instanceof Uint8Array) return false;
  if (typeof Blob !== "undefined" && body instanceof Blob) return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return false;
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return false;
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return false;
  }
  return true;
};

const normalizeInit = (
  init: FetchExtOptionsBase["init"],
  opts: {
    accept?: string;
    idempotency?: { key: string; headerName: string };
  }
): RequestInit => {
  const { body, headers: headersInit, ...rest } = init ?? {};
  const headers = new Headers(headersInit);
  if (opts.accept !== undefined && !headers.has("accept")) {
    headers.set("accept", opts.accept);
  }

  if (opts.idempotency && !headers.has(opts.idempotency.headerName)) {
    headers.set(opts.idempotency.headerName, opts.idempotency.key);
  }

  if (isJsonBody(body)) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return { ...rest, headers, body: JSON.stringify(body) };
  }

  const out: RequestInit = { ...rest, headers };
  if (body !== undefined) {
    out.body = body as RequestInit["body"];
  }
  return out;
};

const parseJsonWithSchema = async <T>(
  response: Response,
  schema: ZodType<T>,
  url: string
): Promise<T> => {
  const text = await response.text();

  let json: unknown;
  try {
    json = text.length === 0 ? null : JSON.parse(text);
  } catch (cause) {
    const snippet = text.slice(0, 500);
    throw new FetchExtInvalidJsonError({
      url,
      status: response.status,
      bodyTextSnippet: snippet,
      cause,
    });
  }

  const validated = schema.safeParse(json);
  if (!validated.success) {
    throw new FetchExtSchemaValidationError({
      url,
      status: response.status,
      issues: validated.error.issues,
    });
  }

  return validated.data;
};

const parseText = async (response: Response): Promise<string> => {
  return await response.text();
};

const parseBlob = async (response: Response): Promise<Blob> => {
  return await response.blob();
};

const getDelayMs = (
  attemptIndex: number,
  retryDelay: number,
  backoff: "exponential" | "none"
): number => {
  return backoff === "exponential"
    ? retryDelay * 2 ** attemptIndex
    : retryDelay;
};

const canRetry = (attemptIndex: number, retries: number): boolean => {
  return attemptIndex < retries;
};

const isAbortError = (error: unknown): boolean => {
  return error instanceof Error && error.name === "AbortError";
};

const capDelayMs = (delayMs: number, maxRetryWaitMs?: number): number => {
  if (maxRetryWaitMs === undefined) return delayMs;
  return Math.min(delayMs, maxRetryWaitMs);
};

const applyJitter = (delayMs: number, jitter: boolean): number => {
  if (!jitter) return delayMs;
  return Math.random() * delayMs;
};

const parseRetryAfterMs = (value: string, nowMs: number): number | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // delta seconds
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  // HTTP-date
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed - nowMs);
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  attempt: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal, ...init });
  } catch (error) {
    if (isAbortError(error)) {
      throw new FetchExtTimeoutError({ url, timeoutMs, attempt });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeAttemptError = (url: string, error: unknown): unknown => {
  if (error instanceof CustomError) return error;
  return new FetchExtNetworkError({ url, cause: error });
};

const getErrorDelayMs = (args: {
  attemptIndex: number;
  retryDelay: number;
  backoff: "exponential" | "none";
  maxRetryWaitMs?: number;
  jitter: boolean;
}): number => {
  const capped = capDelayMs(
    getDelayMs(args.attemptIndex, args.retryDelay, args.backoff),
    args.maxRetryWaitMs
  );
  return applyJitter(capped, args.jitter);
};

const getHttpStatusDelayMs = (args: {
  attemptIndex: number;
  response: Response;
  retryDelay: number;
  backoff: "exponential" | "none";
  maxRetryWaitMs?: number;
  respectRetryAfter: boolean;
  jitter: boolean;
}): number => {
  const backoffDelay = getDelayMs(
    args.attemptIndex,
    args.retryDelay,
    args.backoff
  );
  if (!args.respectRetryAfter) {
    return applyJitter(
      capDelayMs(backoffDelay, args.maxRetryWaitMs),
      args.jitter
    );
  }

  const retryAfterHeader = args.response.headers.get("retry-after");
  if (!retryAfterHeader) {
    return applyJitter(
      capDelayMs(backoffDelay, args.maxRetryWaitMs),
      args.jitter
    );
  }

  const retryAfterMs = parseRetryAfterMs(retryAfterHeader, Date.now());
  if (retryAfterMs === null) {
    return applyJitter(
      capDelayMs(backoffDelay, args.maxRetryWaitMs),
      args.jitter
    );
  }

  return applyJitter(
    capDelayMs(Math.max(backoffDelay, retryAfterMs), args.maxRetryWaitMs),
    args.jitter
  );
};

const retrySleep = async (args: {
  url: string;
  attempt: number;
  retries: number;
  delayMs: number;
  reason: "http_status" | "timeout" | "error";
  status?: number;
  error?: unknown;
  onRetry?: FetchExtOptionsBase["onRetry"];
}): Promise<void> => {
  callOnRetry(args.onRetry, {
    url: args.url,
    attempt: args.attempt,
    retries: args.retries,
    delayMs: args.delayMs,
    reason: args.reason,
    status: args.status,
    error: args.error,
  });
  await sleep(args.delayMs);
};

const fetchWithRetries = async (args: {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  retries: number;
  retryDelay: number;
  backoff: "exponential" | "none";
  retryOnHttpStatuses: number[];
  maxRetryWaitMs?: number;
  jitter: boolean;
  respectRetryAfter: boolean;
  throwOnHttpError: boolean;
  onRetry?: FetchExtOptionsBase["onRetry"];
}): Promise<Response> => {
  let lastError: unknown = null;

  const handleHttpStatusRetry = async (
    attemptIndex: number,
    attempt: number,
    response: Response
  ): Promise<boolean> => {
    const shouldRetry =
      args.retryOnHttpStatuses.includes(response.status) &&
      canRetry(attemptIndex, args.retries);
    if (!shouldRetry) return false;

    const delayMs = getHttpStatusDelayMs({
      attemptIndex,
      response,
      retryDelay: args.retryDelay,
      backoff: args.backoff,
      maxRetryWaitMs: args.maxRetryWaitMs,
      respectRetryAfter: args.respectRetryAfter,
      jitter: args.jitter,
    });

    await retrySleep({
      url: args.url,
      attempt,
      retries: args.retries,
      delayMs,
      reason: "http_status",
      status: response.status,
      onRetry: args.onRetry,
    });

    return true;
  };

  const handleAttemptError = async (
    attemptIndex: number,
    attempt: number,
    error: unknown
  ): Promise<void> => {
    if (error instanceof CustomError && error.code === "FETCH_HTTP_ERROR") {
      throw error;
    }

    if (error instanceof CustomError && error.code === "FETCH_TIMEOUT") {
      if (!canRetry(attemptIndex, args.retries)) throw error;

      const delayMs = getErrorDelayMs({
        attemptIndex,
        retryDelay: args.retryDelay,
        backoff: args.backoff,
        maxRetryWaitMs: args.maxRetryWaitMs,
        jitter: args.jitter,
      });

      await retrySleep({
        url: args.url,
        attempt,
        retries: args.retries,
        delayMs,
        reason: "timeout",
        error,
        onRetry: args.onRetry,
      });
      return;
    }

    if (!canRetry(attemptIndex, args.retries)) {
      throw new FetchExtRetriesExhaustedError({
        url: args.url,
        retries: args.retries,
        cause: error,
      });
    }

    const delayMs = getErrorDelayMs({
      attemptIndex,
      retryDelay: args.retryDelay,
      backoff: args.backoff,
      maxRetryWaitMs: args.maxRetryWaitMs,
      jitter: args.jitter,
    });

    await retrySleep({
      url: args.url,
      attempt,
      retries: args.retries,
      delayMs,
      reason: "error",
      error,
      onRetry: args.onRetry,
    });
  };

  for (let i = 0; i <= args.retries; i++) {
    const attempt = i + 1;

    try {
      const response = await fetchWithTimeout(
        args.url,
        args.init,
        args.timeoutMs,
        attempt
      );

      if (await handleHttpStatusRetry(i, attempt, response)) continue;

      if (args.throwOnHttpError && !response.ok) {
        throw new FetchExtHttpError({
          url: args.url,
          status: response.status,
          statusText: response.statusText,
        });
      }

      return response;
    } catch (error) {
      const normalized = normalizeAttemptError(args.url, error);
      lastError = normalized;
      await handleAttemptError(i, attempt, normalized);
    }
  }

  if (lastError instanceof CustomError && lastError.code === "FETCH_TIMEOUT") {
    throw lastError;
  }

  throw new FetchExtRetriesExhaustedError({
    url: args.url,
    retries: args.retries,
    cause: lastError,
  });
};

type FetchExtExpectation<T> =
  | { kind: "json"; schema: ZodType<T> }
  | { kind: "text" }
  | { kind: "blob" }
  | { kind: "none" };

const getExpectation = <T>(
  options:
    | FetchExtOptionsBase
    | FetchExtExpectJsonOptions<T>
    | FetchExtExpectTextOptions
    | FetchExtExpectBlobOptions
): FetchExtExpectation<T> => {
  if ("expectJson" in options && options.expectJson !== undefined) {
    return { kind: "json", schema: options.expectJson.schema } as const;
  }
  if ("expectText" in options && options.expectText === true) {
    return { kind: "text" } as const;
  }
  if ("expectBlob" in options && options.expectBlob === true) {
    return { kind: "blob" } as const;
  }
  return { kind: "none" } as const;
};

const getAcceptHeader = <T>(
  expectation: FetchExtExpectation<T>
): string | undefined => {
  if (expectation.kind === "json") return "application/json";
  if (expectation.kind === "text") return "text/plain, */*";
  if (expectation.kind === "blob") return "*/*";
  return;
};

export async function fetchExt(options: FetchExtOptionsBase): Promise<Response>;
export async function fetchExt<T>(
  options: FetchExtExpectJsonOptions<T>
): Promise<FetchExtJsonResult<T>>;
export async function fetchExt(
  options: FetchExtExpectTextOptions
): Promise<{ response: Response; data: string }>;
export async function fetchExt(
  options: FetchExtExpectBlobOptions
): Promise<{ response: Response; data: Blob }>;
export async function fetchExt<T>(
  options:
    | FetchExtOptionsBase
    | FetchExtExpectJsonOptions<T>
    | FetchExtExpectTextOptions
    | FetchExtExpectBlobOptions
): Promise<
  Response | FetchExtJsonResult<T> | { response: Response; data: unknown }
> {
  const expectation = getExpectation(options);

  const {
    url,
    timeout = 10_000,
    retries = 0,
    retryDelay = 500,
    backoff = "exponential",
    retryOnHttpStatuses = [],
    maxRetryWaitMs,
    jitter = false,
    respectRetryAfter = true,
    throwOnHttpError = false,
    idempotencyKey = false,
    idempotencyHeaderName = "Idempotency-Key",
    onRetry,
  } = options;

  const expectationsCount =
    Number("expectJson" in options && options.expectJson !== undefined) +
    Number("expectText" in options && options.expectText === true) +
    Number("expectBlob" in options && options.expectBlob === true);
  if (
    expectationsCount > 1 ||
    (expectationsCount === 1 && expectation.kind === "none")
  ) {
    throw new CustomError(
      "Only one of expectJson, expectText, or expectBlob may be provided",
      "FETCH_EXPECTATION_CONFLICT"
    );
  }

  const method = (options.init?.method ?? "GET").toUpperCase();
  const idempotency =
    idempotencyKey !== false && method !== "GET" && method !== "HEAD"
      ? {
          key: typeof idempotencyKey === "string" ? idempotencyKey : genId(),
          headerName: idempotencyHeaderName,
        }
      : undefined;

  const accept = getAcceptHeader(expectation);

  const init = normalizeInit(options.init, {
    accept,
    idempotency,
  });

  const response = await fetchWithRetries({
    url,
    init,
    timeoutMs: timeout,
    retries,
    retryDelay,
    backoff,
    retryOnHttpStatuses,
    maxRetryWaitMs,
    jitter,
    respectRetryAfter,
    throwOnHttpError,
    onRetry,
  });

  if (expectation.kind === "json") {
    const data = await parseJsonWithSchema(
      response.clone(),
      expectation.schema,
      url
    );
    return { response, data };
  }
  if (expectation.kind === "text") {
    const data = await parseText(response.clone());
    return { response, data };
  }
  if (expectation.kind === "blob") {
    const data = await parseBlob(response.clone());
    return { response, data };
  }

  return response;
}
