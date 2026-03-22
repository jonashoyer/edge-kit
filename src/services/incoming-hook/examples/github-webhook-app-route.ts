import { createAppRouterIncomingHookHandler } from '../app-router-handler';
import { GitHubWebhookVerifier } from '../github-webhook-verifier';

export const POST = createAppRouterIncomingHookHandler({
  verifier: new GitHubWebhookVerifier([process.env.GITHUB_WEBHOOK_SECRET!]),
  async handle(verified) {
    if (verified.event === 'ping') {
      return {
        kind: 'ignored',
        body: { ok: true },
      };
    }

    return {
      kind: 'processed',
      body: {
        provider: verified.provider,
        event: verified.event,
        deliveryId: verified.deliveryId,
      },
    };
  },
});
