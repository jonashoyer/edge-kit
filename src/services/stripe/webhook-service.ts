import Stripe from 'stripe';
import { StripeSyncService } from './sync-service';
import { AbstractLogger } from '../logging/abstract-logger';

export class StripeWebhookService {
  private syncService: StripeSyncService;
  private logger: AbstractLogger | undefined;
  private webhookSecret: string;
  private stripe: Stripe;

  constructor(
    syncService: StripeSyncService,
    stripe: Stripe,
    webhookSecret: string,
    logger?: AbstractLogger,
  ) {
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
    waitUntil?: (promise: Promise<any>) => void
  ): Promise<{ received: boolean; error?: string }> {
    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      this.logger?.info('Received Stripe webhook', {
        eventType: event.type,
        eventId: event.id
      });

      const run: (promise: Promise<any>) => void | Promise<any> = waitUntil ?? ((promise: Promise<any>) => promise);
      await run(this.syncService.processEvent(event));

      return { received: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Webhook signature verification failed', { error: errorMessage });
      return { received: false, error: errorMessage };
    }
  }
}

// NOTE: If you're using this in a Next.js Page Router, you need to disable bodyParser
// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };