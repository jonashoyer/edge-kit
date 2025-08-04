import { NamespaceComposer } from '../../composers/namespace-composer';

/**
 * Key namespace for Stripe-related data in key-value storage
 */
export const stripeKeyNamespace = new NamespaceComposer({
  // Maps user ID to Stripe customer ID
  userToCustomer: (userId: string) => `stripe:user:${userId}`,

  // Stores subscription data for a Stripe customer
  customerSubscription: (customerId: string) => `stripe:customer:${customerId}`,
});
