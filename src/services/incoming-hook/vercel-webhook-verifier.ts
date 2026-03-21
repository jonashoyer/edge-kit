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
      this.secrets.map(async (secret) => {
        return await verifyHmacHex({
          value: request.rawBody,
          secret,
          algorithm: 'sha1',
          expectedHex,
        });
      })
    );

    if (!matched.some(Boolean)) {
      throw new IncomingHookAuthError('Invalid Vercel signature');
    }

    let payload: VercelWebhookPayload;
    try {
      payload = JSON.parse(request.rawBody) as VercelWebhookPayload;
    } catch {
      throw new IncomingHookPayloadError('Invalid Vercel webhook JSON');
    }

    if (typeof payload.type !== 'string') {
      throw new IncomingHookPayloadError('Missing Vercel webhook type');
    }

    return {
      provider: 'vercel',
      event: payload.type,
      deliveryId: typeof payload.id === 'string' ? payload.id : null,
      payload,
      rawBody: request.rawBody,
      headers: request.headers,
    };
  }
}
