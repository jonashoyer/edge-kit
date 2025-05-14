import Stripe from 'stripe';

/**
 * Create a configured Stripe client instance
 * @param secretKey The Stripe secret key from environment variables
 * @returns A configured Stripe client instance
 */
export function createStripeClient(secretKey: string): Stripe {
  if (!secretKey) {
    throw new Error('Stripe secret key is required');
  }

  return new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
    appInfo: {
      name: 'Edge Kit',
      version: '1.0.0',
    },
  });
} 