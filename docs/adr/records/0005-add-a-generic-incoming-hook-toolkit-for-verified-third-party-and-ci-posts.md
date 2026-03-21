# [0005] Add a Generic Incoming Hook Toolkit for Verified Third-Party and CI Posts

**Status:** `Implemented`

**Date:** 2026-03-16

**Supersession Note:** The original direct internal signed-request portion of
this decision was later superseded by ADR-0009, which moved typed internal
service ingress into `src/services/service-ingress/`. The generic webhook
toolkit decision in this ADR remains implemented.

---

## TL;DR

Edge Kit adds a new `src/services/incoming-hook/` service family that
normalizes verified inbound POST handling for Vercel webhooks, GitHub webhook
deliveries, and Stripe webhooks. Raw-body signature verification,
framework-specific route plumbing, and post-verification control flow are
cross-cutting concerns that should not be reimplemented in every consumer.
Future work must keep this toolkit generic and verification-focused rather than
turning it into a deployment-specific orchestrator or moving Stripe business
logic out of the existing Stripe domain. Typed internal service ingress is now
owned by ADR-0009 in `src/services/service-ingress/`.

---

## Decision

Edge Kit implements a dedicated `incoming-hook` service family under
`src/services/incoming-hook/` as the generic primitive for receiving, verifying,
normalizing, and dispatching signed inbound POST requests. The service family
will stay copy-paste friendly and dependency-light while separating four
concerns cleanly:

- provider-specific verification of raw request bodies
- framework-neutral normalized verified-event output
- thin Next.js App Router and Pages Router wrappers
- optional bridging from a verified hook into `TaskReconciler`

The toolkit will define a framework-neutral request shape:

- `IncomingHookRequest` with normalized `method`, `pathname`, `headers`, and
  `rawBody`
- `VerifiedIncomingHook<TPayload>` with `provider`, `event`, `deliveryId`,
  `payload`, `rawBody`, and normalized headers
- `IncomingHookVerifier<TPayload>` with `verify(request)`
- `IncomingHookHandlerMode` as `'inline' | 'waitUntil'`

At the time of this decision, the verification layer included four provider
adapters:

- `VercelWebhookVerifier` using `x-vercel-signature`
- `GitHubWebhookVerifier` using `X-Hub-Signature-256`
- `EdgeKitSignedRequestVerifier` for direct GitHub Actions POSTs using a custom
  Edge-Kit HMAC contract
- `StripeIncomingHookVerifier` using Stripe’s webhook verification contract and
  raw request body

The internal signed-request adapter above was later removed from
`incoming-hook` and replaced by the dedicated `service-ingress` service family
described in ADR-0009.

The cryptographic helper surface for generic HMAC-based providers will be added
to `src/utils/crypto-utils.ts` or a sibling HMAC utility and will support:

- `sha1` and `sha256`
- hex output
- constant-time comparison

The current `src/utils/signature-utils.ts` helpers will remain scoped to their
existing anti-scraping and timestamped-signature use case and must not be
reused as the provider webhook verification primitive.

The route-wrapper layer will provide:

- `createAppRouterIncomingHookHandler(options)` for App Router
- `createPagesRouterIncomingHookHandler(options)` for Pages Router
- `incomingHookPagesRouterConfig = { api: { bodyParser: false } }`

The App Router wrapper will read `await request.text()` and verify the raw body
before any payload parsing. The Pages Router wrapper will manually read the raw
request stream and must rely on `bodyParser: false` so provider signature
verification remains correct.

Wrapper response semantics for v1 are standardized as:

- `405` for non-POST methods
- `401` for missing or invalid authentication/signature
- `400` for malformed JSON
- `200` for verified-but-ignored events
- `200` for verified inline success
- `202` for verified `waitUntil` success

`waitUntil` mode is supported only when a real `waitUntil` function is
available. The wrapper must not simulate reliable post-response work. In
environments without `waitUntil`, the handler must use inline mode or an
already-fast awaited callback such as queue enqueueing.

In the shipped wrapper contract, `waitUntil` is passed into the caller-owned
`handle(verified, context)` callback as an optional function. The wrapper does
not schedule background work implicitly on the caller’s behalf. This keeps the
control flow explicit and prevents false assumptions about post-response
durability.

The `TaskReconciler` integration remains thin and generic. The toolkit will add
an optional helper such as
`runVerifiedHookWithTaskReconciler({ verified, reconciler, resolveReconcile })`
that accepts a verified hook and lets caller code decide whether and how it
maps to reconciliation. This helper exists to reduce boilerplate, not to create
a deployment-specific orchestration layer. Event filtering, `taskName`, and
`desiredRevision` stay in caller-owned code.

Stripe support is part of this generic toolkit only at the verified incoming
event layer. Payment synchronization, subscription handling, and other Stripe
business workflows remain in `src/services/stripe/`.

### Alternatives Considered

- **Add deployment-specific webhook-to-reconciler orchestration directly:**
  Rejected — it would overfit the toolkit to one operational workflow and make
  provider verification harder to reuse outside deployment automation.
- **Extend the existing Stripe webhook service into a generic webhook toolkit:**
  Rejected — Stripe’s service owns billing-domain behavior and should not become
  the generic home for Vercel, GitHub, and CI ingress concerns.
- **Reuse `src/utils/signature-utils.ts` for all provider verification:**
  Rejected — its current contract is timestamped request signing for
  anti-scraping and does not model provider raw-body HMAC verification.
- **Support App Router only:** Rejected — App Router should be the preferred
  default, but Pages Router still needs a first-class copy-paste path for raw
  body verified webhooks.

---

## Constraints

- `src/services/incoming-hook/` must remain generic, reusable, and
  copy-paste friendly.
- The toolkit must center on verified inbound request handling. Do not evolve
  it into a deployment-specific orchestrator, job scheduler, or provider-owned
  business workflow layer in this phase.
- All provider verification must use the raw request body exactly as delivered.
  Do not parse JSON before verification.
- `src/utils/signature-utils.ts` must not be repurposed as the provider
  webhook verification primitive.
- `StripeIncomingHookVerifier` may normalize verified Stripe events, but Stripe
  payment and sync logic must remain in `src/services/stripe/`.
- App Router wrappers must verify against `await request.text()`.
- Pages Router wrappers must require `bodyParser: false` and must manually read
  the raw request stream.
- `waitUntil` mode must only be exposed when a real `waitUntil` hook is
  available; do not fake durable post-response execution.
- The `TaskReconciler` bridge must stay thin and generic. It may reduce
  boilerplate, but it must not hardcode deployment-to-task mapping policy.
- V1 must not add a global replay-dedup store. Idempotency remains the concern
  of caller business logic, including `TaskReconciler`.

---

## Consequences

Positive: Edge Kit gains a reusable ingress layer for verified third-party and
CI-driven POST requests, making webhook and internal release endpoints easier
to compose consistently across Next.js stacks.

Negative: The repo adds another cross-cutting service family with framework
wrappers, provider-specific verification rules, and nuanced raw-body handling
requirements that must be documented and tested carefully.

Observed tradeoff: `waitUntil` support is safer because the wrapper refuses to
fake it, but callers now need to make an explicit choice inside their handler
about whether they are doing inline work or scheduling via the provided
`context.waitUntil`.

Tech debt deferred or created: V1 intentionally defers replay-dedup storage,
deployment-specific orchestration, provider SDK abstraction beyond the selected
verifiers, and framework adapters beyond Next.js App Router and Pages Router.

---

## Assumptions and Defaults

- Assumes App Router is the preferred default for new Next.js integrations, but
  Pages Router support remains necessary for reusable copy-paste adoption.
- Assumes providers may retry deliveries and that consumers will rely on their
  own idempotent business layer, including `TaskReconciler`, rather than a
  shared ingress replay store in v1.
- Assumes secrets may rotate, so generic HMAC verifiers should accept arrays of
  secrets for verification.
- Assumes Vercel `deployment.promoted` is the default “now live” event for the
  deployment example path, while other provider events remain caller-filtered.
- Assumes Stripe verification should continue using Stripe’s own verification
  contract rather than being reimplemented as a generic HMAC-only adapter.

---

## Current State

Implemented: `src/services/incoming-hook/` now contains provider verifiers for
Vercel, GitHub webhook deliveries, and Stripe webhooks, plus App Router and
Pages Router wrappers, raw-body helpers, and a thin bridge into
`TaskReconciler`.

Implemented: focused tests now cover signature verification, wrapper response
behavior, raw-body handling, and reconciler bridging, and example files now
show Vercel, GitHub, and Stripe integration shapes.

Implemented: `src/services/incoming-hook/FEATURE.md`,
`docs/services/incoming-hook.md`, README discoverability updates, and a
`TaskReconciler` integration note now document the toolkit and its intended
boundaries.

---

## User Flow / Public API / Contract Changes

Before:

- Edge Kit has provider-specific Stripe webhook handling and route examples, but
  no generic verified incoming-hook toolkit and no reusable Next wrappers for
  verified third-party or CI POST handling.

After:

- New generic service family: `src/services/incoming-hook/`
- New public contracts:

```ts
type IncomingHookRequest = {
  method: string;
  pathname: string;
  headers: Record<string, string>;
  rawBody: string;
};

type VerifiedIncomingHook<TPayload> = {
  provider: 'vercel' | 'github' | 'stripe';
  event: string;
  deliveryId: string | null;
  payload: TPayload;
  rawBody: string;
  headers: Record<string, string>;
};

interface IncomingHookVerifier<TPayload> {
  verify(request: IncomingHookRequest): Promise<VerifiedIncomingHook<TPayload>>;
}
```

- New wrapper-level API:

```ts
createAppRouterIncomingHookHandler(options)
createPagesRouterIncomingHookHandler(options)
incomingHookPagesRouterConfig
runVerifiedHookWithTaskReconciler(options)
```

- Shipped handler contract details:

```ts
type IncomingHookHandleResult =
  | { kind: 'processed'; status?: 200 | 202; body?: Record<string, unknown> }
  | { kind: 'ignored'; status?: 200; body?: Record<string, unknown> };

type HandleContext = {
  waitUntil?: (promise: Promise<unknown>) => Promise<unknown> | undefined;
};
```

- Example integration model:
  - wrapper reads raw body
  - verifier authenticates and normalizes the event
  - caller decides whether to ignore, handle inline, schedule via the provided
    `waitUntil`, or map to `TaskReconciler`

---

## Related ADRs

- ADR-0004 — Add a TaskReconciler Service for versioned operational work
