import type { Nullable } from "../../utils/type-utils";
import type {
  OrganizationSubscriptionData,
  StripeSubscription,
  SubscriptionOfferData,
} from "./types";

/**
 * Abstract class defining the interface for Stripe storage operations
 */
export abstract class AbstractStripeStore {
  /**
   * Store the relationship between userId and stripeCustomerId
   */
  abstract setUserToCustomerMapping(
    userId: string,
    stripeCustomerId: string
  ): Promise<void>;

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
  abstract getUserSubscriptionData(
    userId: string
  ): Promise<Nullable<StripeSubscription>>;
}

export abstract class AbstractStripeB2BStore extends AbstractStripeStore {
  /**
   * Map organization ID to Stripe customer ID
   */
  abstract setOrganizationToCustomerMapping(
    orgId: string,
    stripeCustomerId: string
  ): Promise<void>;

  /**
   * Get Stripe customer ID for organization
   */
  abstract getStripeCustomerIdByOrg(orgId: string): Promise<Nullable<string>>;

  /**
   * Resolve organization by Stripe customer ID (reverse mapping)
   */
  abstract getOrganizationByCustomerId(
    stripeCustomerId: string
  ): Promise<Nullable<string>>;

  /**
   * Store and fetch cached subscription snapshot for an organization
   */
  abstract setOrganizationSubscription(
    orgId: string,
    data: OrganizationSubscriptionData
  ): Promise<void>;
  abstract getOrganizationSubscription(
    orgId: string
  ): Promise<Nullable<OrganizationSubscriptionData>>;

  /**
   * Store and fetch a preconfigured subscription offer for an organization
   */
  abstract setSubscriptionOffer(
    orgId: string,
    offer: SubscriptionOfferData
  ): Promise<void>;
  abstract getSubscriptionOffer(
    orgId: string
  ): Promise<Nullable<SubscriptionOfferData>>;
  abstract removeSubscriptionOffer(orgId: string): Promise<void>;

  /**
   * Authorization helpers for admin checks (implementation-specific)
   */
  abstract getUserOrganizations(userId: string): Promise<string[]>;
  abstract isUserOrgAdmin(userId: string, orgId: string): Promise<boolean>;
}
