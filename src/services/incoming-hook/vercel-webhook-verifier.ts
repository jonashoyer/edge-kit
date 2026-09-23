import { parseSignatureHeader, verifyHmacHex } from '../../utils/crypto-utils';
import type {
  IncomingHookRequest,
  IncomingHookVerifier,
  VerifiedIncomingHook,
} from './abstract-incoming-hook';
import { IncomingHookAuthError, IncomingHookPayloadError } from './errors';

export type VercelWebhookPayload = {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export class VercelWebhookVerifier
  implements IncomingHookVerifier<VercelWebhookPayload>
{
  private readonly secrets: string[];

  constructor(secrets: string[]) {
    if (secrets.length === 0) {
      throw new Error('VercelWebhookVerifier requires at least one secret');
    }
    this.secrets = secrets;
  }

  async verify(
    request: IncomingHookRequest
  ): Promise<VerifiedIncomingHook<VercelWebhookPayload>> {
    const signatureHeader = request.headers['x-vercel-signature'];
    if (!signatureHeader) {
      throw new IncomingHookAuthError('Missing Vercel signature');
    }

    const expectedHex =
      parseSignatureHeader(signatureHeader, 'sha1=') ?? signatureHeader;

    const matched = await Promise.all(
      this.secrets.map(
        async (secret) =>
          await verifyHmacHex({
            algorithm: 'sha1',
            expectedHex,
            secret,
            value: request.rawBody,
          })
      )
    );

    if (!matched.some(Boolean)) {
      throw new IncomingHookAuthError('Invalid Vercel signature');
    }

    let payload: VercelWebhookPayload;
    try {
      payload = JSON.parse(request.rawBody) as VercelWebhookPayload;
    } catch (error) {
      throw new IncomingHookPayloadError('Invalid Vercel webhook JSON', {
        cause: error,
      });
    }

    if (typeof payload.type !== 'string') {
      throw new IncomingHookPayloadError('Missing Vercel webhook type');
    }

    return {
      deliveryId: typeof payload.id === 'string' ? payload.id : null,
      event: payload.type,
      headers: request.headers,
      payload,
      provider: 'vercel',
      rawBody: request.rawBody,
    };
  }
}
