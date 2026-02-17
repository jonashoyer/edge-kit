/**
 * Example Stripe webhook API endpoint
 *
 * This would typically be placed in app/api/stripe/webhook/route.ts
 * for a Next.js App Router project
 */

import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { AbstractKeyValueService } from '../../key-value/abstract-key-value';
import { StripeService } from '..';
import { StripeKVStore } from '../kv-store';

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
 * Stripe's webhook will POST to this endpoint
 * This must be a POST endpoint, and the body should NOT be parsed
 */
export async function POST(req: NextRequest) {
  try {
    // Get raw body and signature (required for webhook verification)
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature' },
        { status: 400 }
      );
    }

    // Initialize service and process webhook
    const stripeService = getStripeService();
    const result = await stripeService.handleWebhook(body, signature);

    if (!result.received) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Always return a 200 success response to Stripe quickly
    // Processing can continue asynchronously
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);

    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// If using Next.js Pages Router, uncomment this:
/*
export const config = {
  api: {
    bodyParser: false,
  },
};
*/
