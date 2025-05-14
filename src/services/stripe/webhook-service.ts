import Stripe from 'stripe';
import { StripeSyncService } from './sync-service';
import { AbstractLogger } from '../logging/abstract-logger';
import { createStripeClient } from './stripe-client';

export class StripeWebhookService {
  private syncService: StripeSyncService;
  private logger: AbstractLogger;
  private webhookSecret: string;
  private stripe: Stripe;

  constructor(
    syncService: StripeSyncService,
    logger: AbstractLogger,
    stripeSecretKey: string,
    webhookSecret: string
  ) {
    this.syncService = syncService;
    this.logger = logger;
    this.webhookSecret = webhookSecret;
    this.stripe = createStripeClient(stripeSecretKey);
  }

  /**
   * Verifies and processes a webhook event from Stripe
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{ received: boolean; error?: string }> {
    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      this.logger.info('Received Stripe webhook', {
        eventType: event.type,
        eventId: event.id
      });

      // Process the event (this is async, but we don't need to wait for it)
      void this.syncService.processEvent(event);

      return { received: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Webhook signature verification failed', { error: errorMessage });
      return { received: false, error: errorMessage };
    }
  }
} 