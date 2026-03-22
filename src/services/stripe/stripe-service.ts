import type Stripe from 'stripe';

import type { AbstractLogger } from '../logging/abstract-logger';
import type { AbstractStripeStore } from './abstract-stripe-store';
import { StripeCheckoutService } from './checkout-service';
import { StripeSubscriptionService } from './subscription-service';
import { StripeSyncService } from './sync-service';
import { StripeWebhookService } from './webhook-service';

export interface StripeServiceOptions {
  logger?: AbstractLogger;

  /**
   * Base URL for the application (used for success/cancel URLs)
   */
  baseUrl: string;

  /**
   * Path for the success callback after checkout
   * Will be appended to baseUrl
   */
  successPath?: string;

  /**
   * Path to redirect to after cancelling checkout
   * Will be appended to baseUrl
   */
  cancelPath?: string;

  /**
   * Secret for webhook verification
   * Should be loaded from environment variable
   */
  webhookSecret: string;

  /**
   * Stripe secret key
   * Should be loaded from environment variable
   */
  secretKey: string;
}

/**
 * Main Stripe service that coordinates all Stripe functionality.
 * Bundles Checkout, Webhook, Sync, and Subscription services into a single interface.
 * Requires an AbstractStripeStore for persisting customer/subscription data.
 */
export class StripeService {
  private readonly store: AbstractStripeStore;
  private readonly syncService: StripeSyncService;
  private readonly checkoutService: StripeCheckoutService;
  private readonly webhookService: StripeWebhookService;
  private readonly subscriptionService: StripeSubscriptionService;

  constructor(
    store: AbstractStripeStore,
    stripe: Stripe,
    options: StripeServiceOptions
  ) {
    this.store = store;

    if (!options.secretKey) {
      throw new Error('Stripe secret key is required');
    }

    if (!options.webhookSecret) {
      throw new Error('Stripe webhook secret is required');
    }

    this.syncService = new StripeSyncService(store, stripe, options.logger);

    this.checkoutService = new StripeCheckoutService(store, stripe, {
      logger: options.logger,
      successUrl: `${options.baseUrl}${options.successPath || '/success'}`,
      cancelUrl: `${options.baseUrl}${options.cancelPath || '/'}`,
    });

    this.webhookService = new StripeWebhookService(
      this.syncService,
      stripe,
      options.webhookSecret,
      options.logger
    );

    this.subscriptionService = new StripeSubscriptionService(
      store,
      this.syncService,
      stripe,
      options.logger
    );
  }

  /**
   * Create a subscription checkout session
   */
  async createSubscriptionCheckout(
    userId: string,
    email: string,
    priceId: string,
    options?: Parameters<StripeCheckoutService['createSubscriptionCheckout']>[3]
  ) {
    return await this.checkoutService.createSubscriptionCheckout(
      userId,
      email,
      priceId,
      options
    );
  }

  /**
   * Create a one-time payment checkout session
   */
  async createOneTimeCheckout(
    userId: string,
    email: string,
    lineItems: Parameters<StripeCheckoutService['createOneTimeCheckout']>[2],
    options?: Parameters<StripeCheckoutService['createOneTimeCheckout']>[3]
  ) {
    return await this.checkoutService.createOneTimeCheckout(
      userId,
      email,
      lineItems,
      options
    );
  }

  /**
   * Handle a Stripe webhook
   */
  async handleWebhook(payload: string | Buffer, signature: string) {
    return await this.webhookService.handleWebhook(payload, signature);
  }

  /**
   * Manually trigger a sync of Stripe data for a user
   */
  async syncStripeDataForUser(userId: string) {
    const customerId = await this.store.getStripeCustomerId(userId);
    if (!customerId) {
      return null;
    }

    return await this.syncService.syncStripeData(customerId);
  }

  /**
   * Check if a user has an active subscription
   */
  async hasActiveSubscription(userId: string) {
    return await this.subscriptionService.hasActiveSubscription(userId);
  }

  /**
   * Get a user's subscription data
   */
  async getUserSubscription(userId: string) {
    return await this.subscriptionService.getUserSubscription(userId);
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscriptionAtPeriodEnd(userId: string) {
    return await this.subscriptionService.cancelSubscriptionAtPeriodEnd(userId);
  }

  /**
   * Resume a subscription (remove cancellation)
   */
  async resumeSubscription(userId: string) {
    return await this.subscriptionService.resumeSubscription(userId);
  }

  /**
   * Create a customer portal session for managing subscriptions
   */
  async createCustomerPortalSession(userId: string, returnUrl: string) {
    return await this.subscriptionService.createCustomerPortalSession(
      userId,
      returnUrl
    );
  }
}
