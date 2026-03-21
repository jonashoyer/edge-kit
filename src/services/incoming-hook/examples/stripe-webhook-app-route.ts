import Stripe from 'stripe';

import {
  createAppRouterIncomingHookHandler,
  StripeIncomingHookVerifier,
} from '..';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

export const POST = createAppRouterIncomingHookHandler({
  verifier: new StripeIncomingHookVerifier(stripe, [
    process.env.STRIPE_WEBHOOK_SECRET!,
  ]),
  async handle(verified) {
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
