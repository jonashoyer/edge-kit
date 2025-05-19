import Stripe from 'stripe';
import { AbstractLogger } from '../logging/abstract-logger';
import { AbstractStripeStore } from './abstract-stripe-store';

export class StripeCheckoutService {
  private store: AbstractStripeStore;
  private logger: AbstractLogger | undefined;
  private stripe: Stripe;
  private successUrl: string;
  private cancelUrl: string;

  constructor(
    store: AbstractStripeStore,
    stripe: Stripe,
    options: {
      logger?: AbstractLogger,
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
      const customer = await this.stripe.customers.create({
        email,
        metadata: {
          userId, // Important: Store reference to our userId
        },
      }, {
        idempotencyKey: userId,
      });

      // Store the mapping in our KV store
      await this.store.setUserToCustomerMapping(userId, customer.id);

      this.logger?.info('Created new Stripe customer', { userId, customerId: customer.id });
      return customer.id;
    } catch (error) {
      this.logger?.error('Failed to create Stripe customer', { userId, error });
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
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        subscription_data: options?.trialPeriodDays
          ? { trial_period_days: options.trialPeriodDays }
          : undefined,
        success_url: options?.successUrl || this.successUrl,
        cancel_url: options?.cancelUrl || this.cancelUrl,
        metadata: {
          userId,
          ...options?.metadata,
        },
      });

      this.logger?.info('Created subscription checkout session', {
        userId,
        customerId,
        checkoutSessionId: session.id
      });

      return session;
    } catch (error) {
      this.logger?.error('Failed to create subscription checkout', { userId, error });
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
        customer: customerId,
        payment_method_types: ['card'],
        line_items: lineItems.map(item => ({
          price: item.priceId,
          quantity: item.quantity,
        })),
        mode: 'payment',
        success_url: options?.successUrl || this.successUrl,
        cancel_url: options?.cancelUrl || this.cancelUrl,
        metadata: {
          userId,
          ...options?.metadata,
        },
      });

      this.logger?.info('Created one-time payment checkout session', {
        userId,
        customerId,
        checkoutSessionId: session.id
      });

      return session;
    } catch (error) {
      this.logger?.error('Failed to create one-time checkout', { userId, error });
      throw error;
    }
  }
} 