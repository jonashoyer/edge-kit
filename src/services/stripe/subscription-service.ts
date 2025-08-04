import Stripe from 'stripe';

import { AbstractLogger } from '../logging/abstract-logger';
import { AbstractStripeStore } from './abstract-stripe-store';
import { StripeSyncService } from './sync-service';
import { StripeSubscription } from './types';

export class StripeSubscriptionService {
  private store: AbstractStripeStore;
  private syncService: StripeSyncService;
  private stripe: Stripe;
  private logger: AbstractLogger | undefined;

  constructor(store: AbstractStripeStore, syncService: StripeSyncService, stripe: Stripe, logger?: AbstractLogger) {
    this.store = store;
    this.syncService = syncService;
    this.stripe = stripe;
    this.logger = logger;
  }

  /**
   * Get the current subscription data for a user
   */
  async getUserSubscription(userId: string): Promise<StripeSubscription | null> {
    try {
      return await this.store.getUserSubscriptionData(userId);
    } catch (error) {
      this.logger?.error('Failed to get user subscription', { userId, error });
      throw error;
    }
  }

  /**
   * Check if a user has an active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);

    if (!subscription) {
      return false;
    }

    // If status is "none", user has no subscription
    if (subscription.status === 'none') {
      return false;
    }

    // Consider active statuses
    const activeStatuses: Array<StripeSubscription['status']> = ['active', 'trialing'];

    return activeStatuses.includes(subscription.status);
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscriptionAtPeriodEnd(userId: string): Promise<boolean> {
    try {
      const stripeCustomerId = await this.store.getStripeCustomerId(userId);
      if (!stripeCustomerId) {
        return false;
      }

      const subscriptionData = await this.store.getCustomerSubscriptionData(stripeCustomerId);
      if (!subscriptionData || subscriptionData.status === 'none' || !('subscriptionId' in subscriptionData)) {
        return false;
      }

      // Check for null subscriptionId
      if (!subscriptionData.subscriptionId) {
        this.logger?.warn('No subscription ID found for cancellation', { userId });
        return false;
      }

      await this.stripe.subscriptions.update(subscriptionData.subscriptionId, {
        cancel_at_period_end: true,
      });

      // Sync the updated data back to KV
      await this.syncService.syncStripeData(stripeCustomerId);

      this.logger?.info('Subscription canceled at period end', {
        userId,
        subscriptionId: subscriptionData.subscriptionId,
      });

      return true;
    } catch (error) {
      this.logger?.error('Failed to cancel subscription', { userId, error });
      throw error;
    }
  }

  /**
   * Resume a subscription (remove the cancellation)
   */
  async resumeSubscription(userId: string): Promise<boolean> {
    try {
      const stripeCustomerId = await this.store.getStripeCustomerId(userId);
      if (!stripeCustomerId) {
        return false;
      }

      const subscriptionData = await this.store.getCustomerSubscriptionData(stripeCustomerId);
      if (
        !subscriptionData ||
        subscriptionData.status === 'none' ||
        !('subscriptionId' in subscriptionData) ||
        !subscriptionData.cancelAtPeriodEnd
      ) {
        return false;
      }

      // Check for null subscriptionId
      if (!subscriptionData.subscriptionId) {
        this.logger?.warn('No subscription ID found for resumption', { userId });
        return false;
      }

      await this.stripe.subscriptions.update(subscriptionData.subscriptionId, {
        cancel_at_period_end: false,
      });

      // Sync the updated data back to KV
      await this.syncService.syncStripeData(stripeCustomerId);

      this.logger?.info('Subscription resumed', {
        userId,
        subscriptionId: subscriptionData.subscriptionId,
      });

      return true;
    } catch (error) {
      this.logger?.error('Failed to resume subscription', { userId, error });
      throw error;
    }
  }

  /**
   * Create a customer portal session to manage subscription
   */
  async createCustomerPortalSession(userId: string, returnUrl: string): Promise<string | null> {
    try {
      const stripeCustomerId = await this.store.getStripeCustomerId(userId);
      if (!stripeCustomerId) {
        return null;
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      return session.url;
    } catch (error) {
      this.logger?.error('Failed to create customer portal session', { userId, error });
      throw error;
    }
  }
}
