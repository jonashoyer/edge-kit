# Service Ingress

The `service-ingress` service family provides typed internal service-to-service
ingress over signed JSON `POST` requests using one shared endpoint per
receiving service.

## Overview

This toolkit separates four concerns:

- typed ingress definition
- signed request creation
- shared-endpoint dispatch by ingress name
- thin App Router and Pages Router handlers built on `incoming-hook`

It does not do service discovery, target mapping, or authorization policy
beyond shared-secret verification.

When an ingress `execute` handler returns a value, that value becomes the JSON
response body. If it returns nothing, the handler emits the generic ack body.

## Core Concepts

Define one ingress per internal operation:

```typescript
type ServiceIngress<TParams> = {
  name: string;
  execute?: (params: TParams) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
};
```

The sender signs the request method, pathname, timestamp, and raw body, then
includes the ingress name in `x-service-ingress`.

## Shared Endpoint Example

```typescript
import {
  createServiceIngressHandler,
  defineServiceIngress,
  sendServiceIngress,
} from '../services/service-ingress/service-ingress';

const searchSyncIngress = defineServiceIngress<{
  revision: string;
}>({
  name: 'search-sync',
  async execute(params) {
    await enqueueSearchSync(params.revision);
  },
});

const cacheRebuildIngress = defineServiceIngress<{
  scope: 'full' | 'partial';
}>({
  name: 'cache-rebuild',
  async execute(params) {
    await enqueueCacheRebuild(params.scope);
  },
});

const reconciler = /* constructed elsewhere in the app */;
const taskReconcilerIngress = defineServiceIngress<{
  mode: 'check' | 'reconcile';
}>({
  name: 'task-reconciler',
  async execute(params) {
    if (params.mode === 'check') {
      return reconciler.checkAll();
    }

    return reconciler.reconcileAll();
  },
});

export const POST = createServiceIngressHandler({
  ingresses: [searchSyncIngress, cacheRebuildIngress, taskReconcilerIngress],
  secrets: [process.env.INTERNAL_SERVICE_INGRESS_SECRET!],
});

await sendServiceIngress({
  url: 'https://search.example.com/api/internal/service-ingress',
  secret: process.env.INTERNAL_SERVICE_INGRESS_SECRET!,
  ingress: searchSyncIngress,
  params: { revision: 'docs-index-v4' },
});
```

## Pages Router

Use `createPagesRouterServiceIngressHandler(...)` with
`serviceIngressPagesRouterConfig` when you need raw-body-safe Pages Router
integration on the same shared endpoint.

## Dispatch Rules

- ingress names must be unique per handler
- unknown ingress names return `401`
- invalid JSON after verification returns `400`
- successful execution returns the body from `execute`, or a generic ack body
  when `execute` returns nothing
