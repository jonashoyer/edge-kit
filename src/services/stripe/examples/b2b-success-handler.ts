import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';

import type { AbstractKeyValueService } from '../../key-value/abstract-key-value';
import { StripeB2BService } from '../b2b-service';
import { StripeB2BKVStore } from '../kv-b2b-store';

function getAuthenticatedAdmin(req: NextRequest) {
  const orgId = req.headers.get('x-org-id');
  const adminUserId = req.headers.get('x-user-id');
  if (!(orgId && adminUserId)) return null;
  return { orgId, adminUserId };
}

function getKeyValueService(): AbstractKeyValueService {
  throw new Error('Implement KV service');
}

function getStripeB2B(): StripeB2BService {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
  });
  return new StripeB2BService(
    new StripeB2BKVStore(getKeyValueService()),
    stripe,
    {
      baseUrl: process.env.APP_URL || 'http://localhost:3000',
      successPath: '/billing/success',
      cancelPath: '/billing',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    }
  );
}

export async function GET(req: NextRequest) {
  const auth = getAuthenticatedAdmin(req);
  if (!auth) return redirect('/login');

  // Eagerly sync subscription data like in the playbook
  const svc = getStripeB2B();
  const customerId = await svc['store'].getStripeCustomerIdByOrg(auth.orgId);
  if (customerId) {
    await svc['syncService'].syncStripeData(customerId);
  }
  return redirect('/billing/dashboard?success=true');
}
