import {
  hmacHex,
  parseSignatureHeader,
  verifyHmacHex,
} from '../../utils/crypto-utils';
import type {
  IncomingHookRequest,
  IncomingHookVerifier,
  VerifiedIncomingHook,
} from '../incoming-hook/abstract-incoming-hook';
import {
  IncomingHookAuthError,
  IncomingHookPayloadError,
} from '../incoming-hook/errors';

export const SERVICE_INGRESS_HEADER = 'x-service-ingress';
export const SERVICE_SIGNATURE_HEADER = 'x-service-signature';
export const SERVICE_TIMESTAMP_HEADER = 'x-service-timestamp';

export type SignedServiceRequestVerifierOptions = {
  secrets: string[];
  maxDriftMs?: number;
};

const DEFAULT_MAX_DRIFT_MS = 3 * 60 * 1000;

export const buildSignedServiceRequestCanonicalString = (
  request: Pick<IncomingHookRequest, 'method' | 'pathname' | 'rawBody'>,
  timestamp: string
) => {
  return [
    request.method.toUpperCase(),
    request.pathname,
    timestamp,
    request.rawBody,
  ].join('\n');
};

export type CreateServiceIngressHeadersOptions = {
  ingress: string;
  method: string;
  pathname: string;
  rawBody: string;
  secret: string;
  timestamp?: number | string;
};

export const createServiceIngressHeaders = async (
  options: CreateServiceIngressHeadersOptions
) => {
  const timestamp = String(options.timestamp ?? Date.now());
  const signature = await hmacHex(
    buildSignedServiceRequestCanonicalString(
      {
        method: options.method,
        pathname: options.pathname,
        rawBody: options.rawBody,
      },
      timestamp
    ),
    options.secret,
    'sha256'
  );

  return {
    [SERVICE_INGRESS_HEADER]: options.ingress,
    [SERVICE_TIMESTAMP_HEADER]: timestamp,
    [SERVICE_SIGNATURE_HEADER]: `sha256=${signature}`,
  };
};

export class SignedServiceRequestVerifier<TPayload = unknown>
  implements IncomingHookVerifier<TPayload>
{
  private readonly secrets: string[];
  private readonly maxDriftMs: number;

  constructor(options: SignedServiceRequestVerifierOptions) {
    if (options.secrets.length === 0) {
      throw new Error(
        'SignedServiceRequestVerifier requires at least one secret'
      );
    }

    this.secrets = options.secrets;
    this.maxDriftMs = options.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  }

  async verify(
    request: IncomingHookRequest
  ): Promise<VerifiedIncomingHook<TPayload>> {
    const ingress = request.headers[SERVICE_INGRESS_HEADER];
    const timestamp = request.headers[SERVICE_TIMESTAMP_HEADER];
    const signatureHeader = request.headers[SERVICE_SIGNATURE_HEADER];

    if (!(ingress && timestamp && signatureHeader)) {
      throw new IncomingHookAuthError('Missing service request headers');
    }

    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs)) {
      throw new IncomingHookAuthError('Invalid service request timestamp');
    }

    if (Math.abs(Date.now() - timestampMs) > this.maxDriftMs) {
      throw new IncomingHookAuthError('Expired service request');
    }

    const expectedHex = parseSignatureHeader(signatureHeader, 'sha256=');
    if (!expectedHex) {
      throw new IncomingHookAuthError('Invalid service request signature');
    }

    const canonical = buildSignedServiceRequestCanonicalString(
      request,
      timestamp
    );
    const matched = await Promise.all(
      this.secrets.map(async (secret) => {
        return await verifyHmacHex({
          value: canonical,
          secret,
          algorithm: 'sha256',
          expectedHex,
        });
      })
    );

    if (!matched.some(Boolean)) {
      throw new IncomingHookAuthError('Invalid service request');
    }

    let payload: TPayload;
    try {
      payload = JSON.parse(request.rawBody) as TPayload;
    } catch {
      throw new IncomingHookPayloadError('Invalid service request JSON');
    }

    return {
      provider: 'service',
      event: ingress,
      deliveryId: null,
      payload,
      rawBody: request.rawBody,
      headers: request.headers,
    };
  }
}
