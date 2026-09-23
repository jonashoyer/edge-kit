import type Stripe from 'stripe';

import type { AbstractLogger } from '../logging/abstract-logger';
import type { AbstractStripeStore } from './abstract-stripe-store';

export class StripeCheckoutService {
  private readonly store: AbstractStripeStore;
  private readonly logger: AbstractLogger | undefined;
  private readonly stripe: Stripe;
  private readonly successUrl: string;
  private readonly cancelUrl: string;

  constructor(
    store: AbstractStripeStore,
    stripe: Stripe,
    options: {
      logger?: AbstractLogger;
      successUrl: string;
      cancelUrl: string;
    }
  ) {
    this.store = store;
    this.stripe = stripe;
    this.logger = options.logger;
    this.successUrl = options.successUrl;
    this.cancelUrl = options.cancelUrl;
  }

  /**
   * Creates or retrieves a Stripe customer for the user
   * This ensures we always have a customerId before checkout
   */
  async getOrCreateStripeCustomer(
    userId: string,
    email: string
  ): Promise<string> {
    try {
      // First check if we already have a customer ID for this user
      const existingCustomerId = await this.store.getStripeCustomerId(userId);
      if (existingCustomerId) {
        return existingCustomerId;
      }

      // Create a new customer in Stripe
      const customer = await this.stripe.customers.create(
        {
          email,
          metadata: {
            userId, // Important: Store reference to our userId
          },
        },
        {
          idempotencyKey: userId,
        }
      );

      // Store the mapping in our KV store
      await this.store.setUserToCustomerMapping(userId, customer.id);

      this.logger?.info('Created new Stripe customer', {
        customerId: customer.id,
        userId,
      });
      return customer.id;
    } catch (error) {
      this.logger?.error('Failed to create Stripe customer', { error, userId });
      throw error;
    }
  }

  /**
   * Creates a checkout session for subscription
   */
  async createSubscriptionCheckout(
    userId: string,
    email: string,
    priceId: string,
    options?: {
      successUrl?: string;
      cancelUrl?: string;
      trialPeriodDays?: number;
      metadata?: Record<string, string>;
    }
  ): Promise<Stripe.Checkout.Session> {
    try {
      // Always make sure we have a Stripe customer ID before creating checkout
      const customerId = await this.getOrCreateStripeCustomer(userId, email);

      // Create the checkout session with the customer ID
      const session = await this.stripe.checkout.sessions.create({
        cancel_url: options?.cancelUrl || this.cancelUrl,
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          userId,
          ...options?.metadata,
        },
        mode: 'subscription',
        payment_method_types: ['card'],
        subscription_data: options?.trialPeriodDays
          ? { trial_period_days: options.trialPeriodDays }
          : undefined,
        success_url: options?.successUrl || this.successUrl,
      });

      this.logger?.info('Created subscription checkout session', {
        checkoutSessionId: session.id,
        customerId,
        userId,
      });

      return session;
    } catch (error) {
      this.logger?.error('Failed to create subscription checkout', {
        error,
        userId,
      });
      throw error;
    }
  }

  /**
   * Creates a checkout session for a one-time payment
   */
  async createOneTimeCheckout(
    userId: string,
    email: string,
    lineItems: Array<{
      priceId: string;
      quantity: number;
    }>,
    options?: {
      successUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<Stripe.Checkout.Session> {
    try {
      // Always make sure we have a Stripe customer ID before creating checkout
      const customerId = await this.getOrCreateStripeCustomer(userId, email);

      // Create the checkout session with the customer ID
      const session = await this.stripe.checkout.sessions.create({
        cancel_url: options?.cancelUrl || this.cancelUrl,
        customer: customerId,
        line_items: lineItems.map((item) => ({
          price: item.priceId,
          quantity: item.quantity,
        })),
        metadata: {
          userId,
          ...options?.metadata,
        },
        mode: 'payment',
        payment_method_types: ['card'],
        success_url: options?.successUrl || this.successUrl,
      });

      this.logger?.info('Created one-time payment checkout session', {
        checkoutSessionId: session.id,
        customerId,
        userId,
      });

      return session;
    } catch (error) {
      this.logger?.error('Failed to create one-time checkout', {
        error,
        userId,
      });
      throw error;
    }
  }
}
