# Incoming Hook

The `incoming-hook` service family provides a reusable way to receive,
authenticate, normalize, and handle signed inbound POST requests from external
systems.

Supported v1 sources:

- Vercel webhooks
- GitHub webhook deliveries
- Stripe webhooks

## Overview

This toolkit separates four concerns:

- raw-body verification
- normalized verified event output
- thin Next.js route wrappers
- optional bridging into `TaskReconciler` through either a direct
  single-task call or a central registry-based sweep

It is intentionally generic. It does not decide which events should trigger
which tasks. Caller code still owns event filtering and decides whether a
verified event should map into direct reconciliation of one task or a
registry-based sweep of many tasks.

Reusable crypto and HTTP helpers used by this toolkit live in
`src/utils/crypto-utils.ts` and `src/utils/http-utils.ts`. The
`incoming-hook` service keeps only hook-specific verification and orchestration
concerns local.

## Core Concepts

Every verifier receives a normalized request shape:

```typescript
type IncomingHookRequest = {
  method: string;
  pathname: string;
  headers: Record<string, string>;
  rawBody: string;
};
```

On success, each verifier returns a normalized verified event:

```typescript
type VerifiedIncomingHook<TPayload> = {
  provider: 'vercel' | 'github' | 'service' | 'stripe';
  event: string;
  deliveryId: string | null;
  payload: TPayload;
  rawBody: string;
  headers: Record<string, string>;
};
```

## App Router Example

```typescript
import {
  createAppRouterIncomingHookHandler,
} from '../services/incoming-hook/app-router-handler';
import { VercelWebhookVerifier } from '../services/incoming-hook/vercel-webhook-verifier';
import { runVerifiedHookWithTaskReconciler } from '../services/incoming-hook/task-reconciler-bridge';

const handler = createAppRouterIncomingHookHandler({
  verifier: new VercelWebhookVerifier([process.env.VERCEL_WEBHOOK_SECRET!]),
  async handle(verified) {
    if (verified.event !== 'deployment.promoted') {
      return {
        kind: 'ignored',
        body: { ignored: true },
      };
    }

    await runVerifiedHookWithTaskReconciler({
      verified,
      reconciler,
      resolveReconcile(event) {
        return {
          taskName: 'documents-index',
          desiredRevision: `deployment:${event.deliveryId}`,
          async run() {
            await enqueueReindex();
          },
        };
      },
    });

    return {
      kind: 'processed',
      body: { received: true },
    };
  },
});

export const POST = handler;
```

## Task Reconciler Bridge

Use the bridge when a verified event should drive reconciliation logic without
letting `incoming-hook` own the task model. The caller can return a direct
single-task reconciliation payload, or it can bypass the bridge and call
`reconciler.reconcileAll()` after verification when a central registry sweep is
the right fit.

```typescript
await runVerifiedHookWithTaskReconciler({
  verified,
  reconciler,
  resolveReconcile(event) {
    if (event.event === 'deployment.promoted') {
      return {
        taskName: 'documents-index',
        desiredRevision: `deployment:${event.deliveryId}`,
        async run() {
          await enqueueReindex();
        },
      };
    }

    return null;
  },
});
```

## Pages Router Example

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

import {
  createPagesRouterIncomingHookHandler,
  incomingHookPagesRouterConfig,
} from '../services/incoming-hook/pages-router-handler';
import { GitHubWebhookVerifier } from '../services/incoming-hook/github-webhook-verifier';

export const config = incomingHookPagesRouterConfig;

export default createPagesRouterIncomingHookHandler({
  verifier: new GitHubWebhookVerifier([process.env.GITHUB_WEBHOOK_SECRET!]),
  async handle(verified) {
    return {
      kind: 'processed',
      body: {
        provider: verified.provider,
        event: verified.event,
      },
    };
  },
});
```

## Stripe Support

`StripeIncomingHookVerifier` handles Stripe’s raw-body signature verification
and normalizes the verified event into the same generic structure used by the
rest of the toolkit.

This does not replace the existing Stripe billing-domain services. It only
solves the common ingress verification and handler-wrapping problem.

## Choosing a Source

- Use Vercel webhooks when Vercel is the source of truth for “deployment is now live.”
- Use GitHub webhook deliveries when reacting to GitHub-owned events directly.
- Use Stripe webhooks when billing events are the external source of truth.

For typed internal service-to-service requests, use the dedicated
`service-ingress` service family instead. That is the preferred surface when a
verified external event needs to trigger `checkAll()` or `reconcileAll()` on a
central `TaskReconciler`.
