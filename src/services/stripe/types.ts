import Stripe from "stripe";

/**
 * Type representing the cached data about a Stripe subscription
 */
export type StripeSubscriptionCache =
  | {
    subscriptionId: string | null;
    status: Stripe.Subscription.Status;
    priceId: string | null;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    paymentMethod: {
      brand: string | null; // e.g., "visa", "mastercard"
      last4: string | null; // e.g., "4242"
    } | null;
  }
  | {
    status: "none";
  };

export const STRIPE_KEY_PREFIXES = {
  // Maps user ID to Stripe customer ID
  USER_TO_CUSTOMER: "stripe:user:",
  // Stores subscription data for a Stripe customer
  CUSTOMER_SUBSCRIPTION: "stripe:customer:",
} as const; 