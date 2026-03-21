import { parseSignatureHeader, verifyHmacHex } from '../../utils/crypto-utils';
import type {
  IncomingHookRequest,
  IncomingHookVerifier,
  VerifiedIncomingHook,
} from './abstract-incoming-hook';
import { IncomingHookAuthError, IncomingHookPayloadError } from './errors';

export type GitHubWebhookPayload = Record<string, unknown>;

export class GitHubWebhookVerifier
  implements IncomingHookVerifier<GitHubWebhookPayload>
{
  private readonly secrets: string[];

  constructor(secrets: string[]) {
    if (secrets.length === 0) {
      throw new Error('GitHubWebhookVerifier requires at least one secret');
    }
    this.secrets = secrets;
  }

  async verify(
    request: IncomingHookRequest
  ): Promise<VerifiedIncomingHook<GitHubWebhookPayload>> {
    const signatureHeader = request.headers['x-hub-signature-256'];
    if (!signatureHeader) {
      throw new IncomingHookAuthError('Missing GitHub webhook signature');
    }

    const expectedHex = parseSignatureHeader(signatureHeader, 'sha256=');
    if (!expectedHex) {
      throw new IncomingHookAuthError('Invalid GitHub signature format');
    }

    const matched = await Promise.all(
      this.secrets.map(async (secret) => {
        return await verifyHmacHex({
          value: request.rawBody,
          secret,
          algorithm: 'sha256',
          expectedHex,
        });
      })
    );

    if (!matched.some(Boolean)) {
      throw new IncomingHookAuthError('Invalid GitHub webhook signature');
    }

    const event = request.headers['x-github-event'];
    if (!event) {
      throw new IncomingHookPayloadError('Missing GitHub event header');
    }

    let payload: GitHubWebhookPayload;
    try {
      payload = JSON.parse(request.rawBody) as GitHubWebhookPayload;
    } catch {
      throw new IncomingHookPayloadError('Invalid GitHub webhook JSON');
    }

    return {
      provider: 'github',
      event,
      deliveryId: request.headers['x-github-delivery'] ?? null,
      payload,
      rawBody: request.rawBody,
      headers: request.headers,
    };
  }
}
