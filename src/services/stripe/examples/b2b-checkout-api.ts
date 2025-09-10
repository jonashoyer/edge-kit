import { type NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import type { AbstractKeyValueService } from "../../key-value/abstract-key-value";
import { StripeB2BService } from "../b2b-service";
import { StripeB2BKVStore } from "../kv-b2b-store";

function getKeyValueService(): AbstractKeyValueService {
  throw new Error("Implement KV service");
}

function getStripeB2B(): StripeB2BService {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
  });
  return new StripeB2BService(
    new StripeB2BKVStore(getKeyValueService()),
    stripe,
    {
      baseUrl: process.env.APP_URL || "http://localhost:3000",
      successPath: "/billing/success",
      cancelPath: "/billing",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orgId, adminUserId } = body;
  if (!(orgId && adminUserId))
    return NextResponse.json(
      { error: "orgId and adminUserId required" },
      { status: 400 }
    );

  const svc = getStripeB2B();
  const session = await svc.createOrganizationCheckout(orgId, adminUserId);
  return NextResponse.json({ url: session.url });
}
