/**
 * Example success route handler after Stripe checkout
 *
 * This would typically be placed in app/billing/success/route.ts
 * for a Next.js App Router project
 */

import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';

import type { AbstractKeyValueService } from '../../key-value/abstract-key-value';
import { StripeService } from '../../stripe';
import { StripeKVStore } from '../kv-store';

// Example auth helper, replace with your own auth implementation
async function getAuthenticatedUser(req: NextRequest) {
  // This is a placeholder - implement your actual auth logic
  // For example, using cookies, JWT, or session to get the user
  const userId = req.headers.get('x-user-id');

  if (!userId) {
    return null;
  }

  return { id: userId };
}

// Example of getting services, replace with your own implementations
function getKeyValueService(): AbstractKeyValueService {
  // Return your KV service implementation
  throw new Error('Implement your KV service retrieval here');
}

// Create Stripe service instance
function getStripeService() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }

  const store = new StripeKVStore(getKeyValueService());

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    appInfo: {
      name: 'Stripe Example App',
      version: '1.0.0',
      url: 'https://example.com',
    },
  });

  return new StripeService(store, stripe, {
    baseUrl: process.env.APP_URL || 'http://localhost:3000',
    successPath: '/billing/success',
    cancelPath: '/billing',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    secretKey: process.env.STRIPE_SECRET_KEY,
  });
}

/**
 * Handle the success redirect from Stripe after checkout completion
 * This eagerly syncs the subscription data rather than waiting for webhooks
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return redirect('/login?returnUrl=/billing/success');
    }

    // Initialize Stripe service
    const stripeService = getStripeService();

    // Eagerly sync the latest subscription data from Stripe
    // This is critical as webhooks might be delayed
    await stripeService.syncStripeDataForUser(user.id);

    // Redirect to the billing dashboard or some other success page
    return redirect('/billing/dashboard?success=true');
  } catch (error) {
    console.error('Success handler error:', error);

    // Even on error, we should redirect somewhere
    return redirect('/billing?error=sync_failed');
  }
}
