import { createAppRouterIncomingHookHandler } from '../app-router-handler';
import { GitHubWebhookVerifier } from '../github-webhook-verifier';

export const POST = createAppRouterIncomingHookHandler({
  async handle(verified) {
    if (verified.event === 'ping') {
      return {
        body: { ok: true },
        kind: 'ignored',
      };
    }

    return {
      body: {
        deliveryId: verified.deliveryId,
        event: verified.event,
        provider: verified.provider,
      },
      kind: 'processed',
    };
  },
  verifier: new GitHubWebhookVerifier([process.env.GITHUB_WEBHOOK_SECRET!]),
});
