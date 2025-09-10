import { NamespaceComposer } from "../../composers/namespace-composer";

/**
 * Key namespace for Stripe-related data in key-value storage
 */
export const stripeKeyNamespace = new NamespaceComposer({
  // Maps user ID to Stripe customer ID
  userToCustomer: (userId: string) => `stripe:user:${userId}`,

  // Stores subscription data for a Stripe customer
  customerSubscription: (customerId: string) => `stripe:customer:${customerId}`,

  // Maps organization ID to Stripe customer ID
  orgToCustomer: (orgId: string) => `stripe:org:${orgId}:customer`,

  // Reverse mapping for quick lookup (customer -> org)
  customerToOrg: (customerId: string) => `stripe:customer:${customerId}:org`,

  // Stores organization subscription data (cached snapshot)
  orgSubscription: (orgId: string) => `stripe:org:${orgId}:subscription`,

  // Stores preconfigured subscription offer per organization
  orgOffer: (orgId: string) => `stripe:org:${orgId}:offer`,
});
