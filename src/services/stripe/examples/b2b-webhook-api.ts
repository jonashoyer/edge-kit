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
  const svc = getStripeB2B();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 }
    );
  const result = await svc.handleWebhook(body, signature);
  if (!result.received)
    return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ received: true });
}

// For Pages Router, bodyParser must be disabled
// export const config = { api: { bodyParser: false } };
