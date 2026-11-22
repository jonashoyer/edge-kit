import { fnv1a64 } from '../../utils/crypto-utils';
import type { CaptureConfig, EscalationRule } from './error-escalation-service';
import { getInternalErrorHash } from './internal-error-persistence';

export type TrpcErrorLike = Error & {
  code: string;
  data?: { httpStatus?: number };
};

export type TrpcOnErrorParams<TContext = unknown> = {
  ctx?: TContext;
  error: TrpcErrorLike;
  path?: string;
  type?: 'query' | 'mutation' | 'subscription' | 'unknown';
};

type ErrorEscalationCapture = {
  capture: (error: unknown, config: CaptureConfig) => Promise<unknown>;
};

export type TrpcErrorEscalationOptions<TContext> = {
  getEscalation: (
    params: TrpcOnErrorParams<TContext>
  ) => ErrorEscalationCapture | undefined;
  enabled?: boolean;
  environment?: string;
  errorLookupBaseUrl?: string;
  clientErrorRules?: EscalationRule[];
  serverErrorRules?: EscalationRule[];
};

const HTTP_STATUS_BY_CODE: Record<string, number> = {
  BAD_GATEWAY: 502,
  BAD_REQUEST: 400,
  CLIENT_CLOSED_REQUEST: 499,
  CONFLICT: 409,
  FORBIDDEN: 403,
  GATEWAY_TIMEOUT: 504,
  INTERNAL_SERVER_ERROR: 500,
  METHOD_NOT_SUPPORTED: 405,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 501,
  PARSE_ERROR: 400,
  PAYLOAD_TOO_LARGE: 413,
  PAYMENT_REQUIRED: 402,
  PRECONDITION_FAILED: 412,
  SERVICE_UNAVAILABLE: 503,
  TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  UNAUTHORIZED: 401,
  UNPROCESSABLE_CONTENT: 422,
  UNSUPPORTED_MEDIA_TYPE: 415,
};

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;
const DEFAULT_CLIENT_ERROR_RULES: EscalationRule[] = [
  {
    cooldownSeconds: ONE_DAY_SECONDS,
    count: 3,
    type: 'threshold',
    windowSeconds: ONE_HOUR_SECONDS,
  },
];
const DEFAULT_SERVER_ERROR_RULES: EscalationRule[] = [
  { intervalSeconds: ONE_DAY_SECONDS, type: 'always' },
];
const NUMBER_SEQUENCE = /\d+/g;
const WHITESPACE_SEQUENCE = /\s+/g;

const normalizeFingerprintPart = (value: string) =>
  value
    .toLowerCase()
    .replace(NUMBER_SEQUENCE, '#')
    .replace(WHITESPACE_SEQUENCE, ' ')
    .trim();

export const getTrpcErrorHttpStatus = (error: TrpcErrorLike) => {
  if (error.data?.httpStatus) {
    return error.data.httpStatus;
  }
  return HTTP_STATUS_BY_CODE[error.code];
};

export const getTrpcErrorFingerprint = ({
  error,
  path,
}: Pick<TrpcOnErrorParams, 'error' | 'path'>) => {
  const canonicalError = [
    path ?? 'unknown-path',
    error.code,
    error.name,
    normalizeFingerprintPart(error.message),
  ].join(':');
  return fnv1a64(canonicalError).toString(16);
};

const buildTrpcErrorMessage = ({
  errorLookupBaseUrl,
  internalErrorHash,
  path,
  status,
  type,
}: {
  errorLookupBaseUrl?: string;
  internalErrorHash?: string;
  path?: string;
  status: number;
  type?: string;
}) => {
  const summary = `HTTP ${status}, procedure: ${path ?? 'unknown'}, type: ${type ?? 'unknown'}`;
  if (!(internalErrorHash && errorLookupBaseUrl)) {
    return summary;
  }
  return `${summary}\nFull diagnostics: ${errorLookupBaseUrl}/admin/errors?hash=${internalErrorHash}`;
};

/**
 * Creates a callback compatible with tRPC's `onError` parameters.
 * Alerts immediately for 5xx errors and after three matching 4xx errors in one hour.
 */
export const createTrpcErrorEscalationHandler =
  <TContext>({
    getEscalation,
    enabled = true,
    environment = 'unknown',
    errorLookupBaseUrl,
    clientErrorRules = DEFAULT_CLIENT_ERROR_RULES,
    serverErrorRules = DEFAULT_SERVER_ERROR_RULES,
  }: TrpcErrorEscalationOptions<TContext>) =>
  async (params: TrpcOnErrorParams<TContext>): Promise<void> => {
    if (!enabled) {
      return;
    }

    const status = getTrpcErrorHttpStatus(params.error);
    if (!status || status < 400 || status >= 600) {
      return;
    }

    const escalation = getEscalation(params);
    if (!escalation) {
      return;
    }

    const fingerprint = getTrpcErrorFingerprint(params);
    const internalErrorHash =
      params.error.code === 'INTERNAL_SERVER_ERROR'
        ? getInternalErrorHash(params.error.message)
        : undefined;

    await escalation.capture(params.error, {
      groupId: fingerprint,
      message: buildTrpcErrorMessage({
        errorLookupBaseUrl,
        internalErrorHash,
        path: params.path,
        status,
        type: params.type,
      }),
      name: `tRPC ${status >= 500 ? 'server' : 'client'} error`,
      rules: status >= 500 ? serverErrorRules : clientErrorRules,
      severity: 'error',
      tags: {
        environment,
        path: params.path ?? 'unknown',
        status: String(status),
        trpcCode: params.error.code,
        ...(internalErrorHash ? { internalErrorHash } : {}),
      },
    });
  };
