import { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { AbstractLogger } from '../logging/abstract-logger';
import { StripeKVStore } from './kv-store';
import { StripeSyncService } from './sync-service';
import { StripeCheckoutService } from './checkout-service';
import { StripeWebhookService } from './webhook-service';
import { StripeSubscriptionService } from './subscription-service';
import { createStripeClient } from './stripe-client';

export * from './types';
export { createStripeClient };

export interface StripeServiceOptions {
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
 * Main Stripe service that coordinates all Stripe functionality
 */
export class StripeService {
  private kvStore: StripeKVStore;
  private syncService: StripeSyncService;
  private checkoutService: StripeCheckoutService;
  private webhookService: StripeWebhookService;
  private subscriptionService: StripeSubscriptionService;
  private logger: AbstractLogger;
  private options: StripeServiceOptions;

  constructor(
    keyValueService: AbstractKeyValueService,
    logger: AbstractLogger,
    options: StripeServiceOptions
  ) {
    this.logger = logger;
    this.options = options;

    if (!options.secretKey) {
      throw new Error('Stripe secret key is required');
    }

    if (!options.webhookSecret) {
      throw new Error('Stripe webhook secret is required');
    }

    // Initialize the component services
    this.kvStore = new StripeKVStore(keyValueService);

    this.syncService = new StripeSyncService(
      this.kvStore,
      this.logger,
      options.secretKey
    );

    this.checkoutService = new StripeCheckoutService(
      this.kvStore,
      this.logger,
      options.secretKey,
      {
        successUrl: `${options.baseUrl}${options.successPath || '/success'}`,
        cancelUrl: `${options.baseUrl}${options.cancelPath || '/'}`,
      }
    );

    this.webhookService = new StripeWebhookService(
      this.syncService,
      this.logger,
      options.secretKey,
      options.webhookSecret
    );

    this.subscriptionService = new StripeSubscriptionService(
      this.kvStore,
      this.syncService,
      this.logger,
      options.secretKey
    );

    this.logger.info('Stripe service initialized');
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
    return this.checkoutService.createSubscriptionCheckout(
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
    return this.checkoutService.createOneTimeCheckout(
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
    return this.webhookService.handleWebhook(payload, signature);
  }

  /**
   * Manually trigger a sync of Stripe data for a user
   */
  async syncStripeDataForUser(userId: string) {
    const customerId = await this.kvStore.getStripeCustomerId(userId);
    if (!customerId) {
      return null;
    }
    return this.syncService.syncStripeDataToKV(customerId);
  }

  /**
   * Check if a user has an active subscription
   */
  async hasActiveSubscription(userId: string) {
    return this.subscriptionService.hasActiveSubscription(userId);
  }

  /**
   * Get a user's subscription data
   */
  async getUserSubscription(userId: string) {
    return this.subscriptionService.getUserSubscription(userId);
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscriptionAtPeriodEnd(userId: string) {
    return this.subscriptionService.cancelSubscriptionAtPeriodEnd(userId);
  }

  /**
   * Resume a subscription (remove cancellation)
   */
  async resumeSubscription(userId: string) {
    return this.subscriptionService.resumeSubscription(userId);
  }

  /**
   * Create a customer portal session for managing subscriptions
   */
  async createCustomerPortalSession(userId: string, returnUrl: string) {
    return this.subscriptionService.createCustomerPortalSession(userId, returnUrl);
  }
} 