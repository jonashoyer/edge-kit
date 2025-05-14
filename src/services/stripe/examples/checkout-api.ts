/**
 * Example Stripe checkout API endpoint
 * 
 * This would typically be placed in app/api/stripe/checkout/route.ts
 * for a Next.js App Router project
 */

import { NextRequest, NextResponse } from 'next/server';
import { StripeService } from '..';
import { AbstractKeyValueService } from '../../key-value/abstract-key-value';
import Stripe from 'stripe';
import { StripeKVStore } from '../kv-store';

// Example auth helper, replace with your own auth implementation
async function getAuthenticatedUser(req: NextRequest) {
  // This is a placeholder - implement your actual auth logic
  // For example, using cookies, JWT, or session to get the user
  const userId = req.headers.get('x-user-id');
  const email = req.headers.get('x-user-email');

  if (!userId || !email) {
    return null;
  }

  return { id: userId, email };
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

  return new StripeService(
    store,
    stripe,
    {
      baseUrl: process.env.APP_URL || 'http://localhost:3000',
      successPath: '/billing/success',
      cancelPath: '/billing',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      secretKey: process.env.STRIPE_SECRET_KEY,
    }
  );
}

// Example API handler for creating a subscription checkout
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const data = await req.json();
    const { priceId } = data;

    if (!priceId) {
      return NextResponse.json(
        { error: 'Price ID is required' },
        { status: 400 }
      );
    }

    const stripeService = getStripeService();

    const checkoutSession = await stripeService.createSubscriptionCheckout(
      user.id,
      user.email,
      priceId
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Checkout error:', error);

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
} 