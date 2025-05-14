import Stripe from 'stripe';
import { StripeKVStore } from './kv-store';
import { StripeSubscriptionCache } from './types';
import { AbstractLogger } from '../logging/abstract-logger';
import { createStripeClient } from './stripe-client';

export class StripeSyncService {
  private kvStore: StripeKVStore;
  private logger: AbstractLogger;
  private stripe: Stripe;

  constructor(
    kvStore: StripeKVStore,
    logger: AbstractLogger,
    stripeSecretKey: string
  ) {
    this.kvStore = kvStore;
    this.logger = logger;
    this.stripe = createStripeClient(stripeSecretKey);
  }

  /**
   * Syncs all subscription data for a Stripe customer to the KV store.
   * This is the heart of our Stripe implementation - a single source of truth.
   * Called after checkout success and by webhook events.
   */
  async syncStripeDataToKV(customerId: string): Promise<StripeSubscriptionCache> {
    try {
      // Fetch latest subscription data from Stripe
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method'],
      });

      // If no subscriptions, store a "none" status
      if (subscriptions.data.length === 0) {
        const subData: StripeSubscriptionCache = { status: 'none' };
        await this.kvStore.setCustomerSubscriptionData(customerId, subData);
        return subData;
      }

      // Get the subscription (we're assuming one subscription per customer)
      const subscription = subscriptions.data[0];

      // Extract and store the subscription data
      const subData: StripeSubscriptionCache = {
        subscriptionId: subscription.id,
        status: subscription.status,
        priceId: subscription.items.data[0].price.id,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        paymentMethod:
          subscription.default_payment_method &&
            typeof subscription.default_payment_method !== 'string'
            ? {
              brand: subscription.default_payment_method.card?.brand ?? null,
              last4: subscription.default_payment_method.card?.last4 ?? null,
            }
            : null,
      };

      // Store the data in KV
      await this.kvStore.setCustomerSubscriptionData(customerId, subData);
      return subData;
    } catch (error) {
      this.logger.error('Error syncing Stripe data to KV', { error, customerId });
      throw error;
    }
  }

  /**
   * Process a Stripe webhook event.
   * This extracts the customer ID and triggers the sync.
   */
  async processEvent(event: Stripe.Event): Promise<StripeSubscriptionCache | null> {
    const allowedEvents: Stripe.Event.Type[] = [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'customer.subscription.paused',
      'customer.subscription.resumed',
      'customer.subscription.pending_update_applied',
      'customer.subscription.pending_update_expired',
      'customer.subscription.trial_will_end',
      'invoice.paid',
      'invoice.payment_failed',
      'invoice.payment_action_required',
      'invoice.upcoming',
      'invoice.marked_uncollectible',
      'invoice.payment_succeeded',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
    ];

    // Skip processing if the event isn't in our tracked list
    if (!allowedEvents.includes(event.type)) {
      return null;
    }

    // Extract customer ID from the event data
    // Most subscription-related events have a customer property
    const eventObject = event.data.object as { customer?: string | Stripe.Customer };
    let customerId: string | undefined;

    if (eventObject.customer) {
      if (typeof eventObject.customer === 'string') {
        customerId = eventObject.customer;
      } else if ('id' in eventObject.customer) {
        customerId = eventObject.customer.id;
      }
    }

    if (!customerId) {
      this.logger.warn('No customer ID found in Stripe event', { event });
      return null;
    }

    // Sync the data and return it
    return this.syncStripeDataToKV(customerId);
  }
} 