import Stripe from 'stripe';

import { AbstractLogger } from '../logging/abstract-logger';
import { StripeSyncService } from './sync-service';

export class StripeWebhookService {
  private syncService: StripeSyncService;
  private logger: AbstractLogger | undefined;
  private webhookSecret: string;
  private stripe: Stripe;

  constructor(syncService: StripeSyncService, stripe: Stripe, webhookSecret: string, logger?: AbstractLogger) {
    this.syncService = syncService;
    this.webhookSecret = webhookSecret;
    this.stripe = stripe;
    this.logger = logger;
  }

  /**
   * Verifies and processes a webhook event from Stripe
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string,
    waitUntil?: (promise: Promise<any>) => void,
  ): Promise<{ received: boolean; error?: string }> {
    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

      this.logger?.info('Received Stripe webhook', {
        eventType: event.type,
        eventId: event.id,
      });

      await safeWaitUntil(waitUntil ?? ((promise: Promise<any>) => promise), this.syncService.processEvent(event));

      return { received: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Webhook signature verification failed', { error: errorMessage });
      return { received: false, error: errorMessage };
    }
  }
}

/**
 * Wraps a waitUntil call to ensure that any errors are logged and not thrown
 * @param waitUntil - The waitUntil function to wrap
 * @param promise - The promise to wait for
 */
const safeWaitUntil = async (
  waitUntil: (promise: Promise<unknown>) => void | Promise<unknown>,
  promise: Promise<unknown>,
) => {
  const fn = async () => {
    try {
      await promise;
    } catch (error) {
      console.error('[SAFE WAIT UNTIL] Error', error);
    }
  };

  waitUntil(fn());
};

// NOTE: If you're using this in a Next.js Page Router, you need to disable bodyParser
// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };
