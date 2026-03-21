import type Stripe from 'stripe';

import type {
  IncomingHookRequest,
  IncomingHookVerifier,
  VerifiedIncomingHook,
} from './abstract-incoming-hook';
import { IncomingHookAuthError } from './errors';

export class StripeIncomingHookVerifier
  implements IncomingHookVerifier<Stripe.Event>
{
  private readonly stripe: Stripe;
  private readonly secrets: string[];

  constructor(stripe: Stripe, secrets: string[]) {
    if (secrets.length === 0) {
      throw new Error(
        'StripeIncomingHookVerifier requires at least one secret'
      );
    }

    this.stripe = stripe;
    this.secrets = secrets;
  }

  async verify(
    request: IncomingHookRequest
  ): Promise<VerifiedIncomingHook<Stripe.Event>> {
    const signature = request.headers['stripe-signature'];
    if (!signature) {
      throw new IncomingHookAuthError('Missing Stripe signature');
    }

    let event: Stripe.Event | null = null;
    for (const secret of this.secrets) {
      try {
        event = this.stripe.webhooks.constructEvent(
          request.rawBody,
          signature,
          secret
        );
        break;
      } catch {}
    }

    if (!event) {
      throw new IncomingHookAuthError('Invalid Stripe signature');
    }

    return {
      provider: 'stripe',
      event: event.type,
      deliveryId: event.id,
      payload: event,
      rawBody: request.rawBody,
      headers: request.headers,
    };
  }
}
