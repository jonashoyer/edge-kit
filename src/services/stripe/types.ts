import type Stripe from "stripe";

/**
 * Type representing the cached data about a Stripe subscription
 */
export type StripeSubscription =
  | {
      subscriptionId: string | null;
      subscriptionItemId?: string | null;
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

export type SubscriptionInterval = "month" | "year" | (string & {});

export type PromotionCodeData = {
  id: string;
  code: string | null;
  active: boolean;
  expiresAt: number | null;
  coupon: {
    id: string;
    name: string | null;
    percentOff: number | null;
    amountOff: number | null;
    currency: string | null;
    duration: Stripe.Coupon.Duration | null;
    redeemBy: number | null;
  };
};

export type SubscriptionOfferData = {
  currency: string; // e.g. 'usd'
  unitAmount: number; // cents
  interval: SubscriptionInterval; // month | year
  promotionCode?: PromotionCodeData;
  trialEndUnix?: number;
  description?: string | null;
};

export type OrganizationSubscriptionData = StripeSubscription & {
  priceId: string | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  // Enrich with offer details captured at creation time if desired
  offer?: SubscriptionOfferData;
};

export type CRMPaymentData = {
  hasPayment: boolean;
  amount?: number; // cents
  interval?: SubscriptionInterval;
  currency?: string;
  promotionCode?: string;
  trialEnd?: number; // unix ts
  status?: string; // subscription status
};

export abstract class AbstractCRMIntegration {
  abstract syncPaymentData(
    orgId: string,
    paymentData: CRMPaymentData
  ): Promise<void>;
}
