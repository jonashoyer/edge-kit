import { Nullable } from '../../utils/type-utils';
import { StripeSubscription } from './types';

/**
 * Abstract class defining the interface for Stripe storage operations
 */
export abstract class AbstractStripeStore {
  /**
   * Store the relationship between userId and stripeCustomerId
   */
  abstract setUserToCustomerMapping(userId: string, stripeCustomerId: string): Promise<void>;

  /**
   * Get the Stripe customer ID for a user
   */
  abstract getStripeCustomerId(userId: string): Promise<Nullable<string>>;

  /**
   * Store subscription data for a customer
   */
  abstract setCustomerSubscriptionData(
    stripeCustomerId: string,
    subscriptionData: StripeSubscription
  ): Promise<void>;

  /**
   * Get subscription data for a customer
   */
  abstract getCustomerSubscriptionData(
    stripeCustomerId: string
  ): Promise<Nullable<StripeSubscription>>;

  /**
   * Get subscription data for a user
   */
  abstract getUserSubscriptionData(userId: string): Promise<Nullable<StripeSubscription>>;
} 