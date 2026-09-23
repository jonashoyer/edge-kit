import Stripe from 'stripe';

import { createAppRouterIncomingHookHandler } from '../app-router-handler';
import { StripeIncomingHookVerifier } from '../stripe-incoming-hook-verifier';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

export const POST = createAppRouterIncomingHookHandler({
  async handle(verified) {
    return {
      body: {
        deliveryId: verified.deliveryId,
        event: verified.event,
        provider: verified.provider,
      },
      kind: 'processed',
    };
  },
  verifier: new StripeIncomingHookVerifier(stripe, [
    process.env.STRIPE_WEBHOOK_SECRET!,
  ]),
});
