import { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { Nullable } from '../../utils/type-utils';
import { StripeSubscription } from './types';
import { stripeKeyNamespace } from './stripe-keys';
import { AbstractStripeStore } from './abstract-stripe-store';

/**
 * Handles key-value storage operations for the Stripe service
 */
export class StripeKVStore implements AbstractStripeStore {
  private kvService: AbstractKeyValueService;

  constructor(kvService: AbstractKeyValueService) {
    this.kvService = kvService;
  }

  /**
   * Store the relationship between userId and stripeCustomerId
   */
  async setUserToCustomerMapping(userId: string, stripeCustomerId: string): Promise<void> {
    const key = stripeKeyNamespace.key('userToCustomer', userId);
    await this.kvService.set(key, stripeCustomerId);
  }

  /**
   * Get the Stripe customer ID for a user
   */
  async getStripeCustomerId(userId: string): Promise<Nullable<string>> {
    const key = stripeKeyNamespace.key('userToCustomer', userId);
    return this.kvService.get<string>(key);
  }

  /**
   * Store subscription data for a customer
   */
  async setCustomerSubscriptionData(
    stripeCustomerId: string,
    subscriptionData: StripeSubscription
  ): Promise<void> {
    const key = stripeKeyNamespace.key('customerSubscription', stripeCustomerId);
    await this.kvService.set(key, subscriptionData);
  }

  /**
   * Get subscription data for a customer
   */
  async getCustomerSubscriptionData(
    stripeCustomerId: string
  ): Promise<Nullable<StripeSubscription>> {
    const key = stripeKeyNamespace.key('customerSubscription', stripeCustomerId);
    return this.kvService.get<StripeSubscription>(key);
  }

  /**
   * Get subscription data for a user (combines the two operations above)
   */
  async getUserSubscriptionData(userId: string): Promise<Nullable<StripeSubscription>> {
    const stripeCustomerId = await this.getStripeCustomerId(userId);
    if (!stripeCustomerId) {
      return null;
    }
    return this.getCustomerSubscriptionData(stripeCustomerId);
  }
} 