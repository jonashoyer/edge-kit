import type Stripe from "stripe";

import type { AbstractLogger } from "../logging/abstract-logger";
import type { AbstractStripeStore } from "./abstract-stripe-store";
import { StripeCheckoutService } from "./checkout-service";
import { StripeSubscriptionService } from "./subscription-service";
import { StripeSyncService } from "./sync-service";
import { StripeWebhookService } from "./webhook-service";

export * from "./abstract-stripe-store";
export * from "./b2b-service";
export * from "./kv-b2b-store";
export * from "./types";

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
 * Main Stripe service that coordinates all Stripe functionality
 */
export class StripeService {
  private store: AbstractStripeStore;
  private syncService: StripeSyncService;
  private checkoutService: StripeCheckoutService;
  private webhookService: StripeWebhookService;
  private subscriptionService: StripeSubscriptionService;
  private logger: AbstractLogger | undefined;
  private options: StripeServiceOptions;
  private stripe: Stripe;

  constructor(
    store: AbstractStripeStore,
    stripe: Stripe,
    options: StripeServiceOptions
  ) {
    this.store = store;
    this.stripe = stripe;
    this.logger = options.logger;
    this.options = options;

    if (!options.secretKey) {
      throw new Error("Stripe secret key is required");
    }

    if (!options.webhookSecret) {
      throw new Error("Stripe webhook secret is required");
    }

    this.syncService = new StripeSyncService(
      this.store,
      this.stripe,
      this.logger
    );

    this.checkoutService = new StripeCheckoutService(this.store, stripe, {
      logger: this.logger,
      successUrl: `${options.baseUrl}${options.successPath || "/success"}`,
      cancelUrl: `${options.baseUrl}${options.cancelPath || "/"}`,
    });

    this.webhookService = new StripeWebhookService(
      this.syncService,
      stripe,
      options.webhookSecret,
      this.logger
    );

    this.subscriptionService = new StripeSubscriptionService(
      this.store,
      this.syncService,
      stripe,
      this.logger
    );
  }

  /**
   * Create a subscription checkout session
   */
  async createSubscriptionCheckout(
    userId: string,
    email: string,
    priceId: string,
    options?: Parameters<StripeCheckoutService["createSubscriptionCheckout"]>[3]
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
    lineItems: Parameters<StripeCheckoutService["createOneTimeCheckout"]>[2],
    options?: Parameters<StripeCheckoutService["createOneTimeCheckout"]>[3]
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
    const customerId = await this.store.getStripeCustomerId(userId);
    if (!customerId) {
      return null;
    }
    return this.syncService.syncStripeData(customerId);
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
    return this.subscriptionService.createCustomerPortalSession(
      userId,
      returnUrl
    );
  }
}
