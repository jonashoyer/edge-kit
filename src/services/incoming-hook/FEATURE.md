# Feature: Incoming Hook

Status: Active
Last Reviewed: 2026-03-20
Related ADRs: 0005, 0009, 0012

## Current State

`src/services/incoming-hook/` provides a generic verified inbound POST toolkit
for Vercel webhooks, GitHub webhook deliveries, and Stripe webhooks.

It owns raw-body verification, normalized verified event output, thin Next.js
App Router and Pages Router wrappers, and a minimal bridge into
`TaskReconciler`. That bridge stays thin: caller code owns event filtering and
chooses whether to route into a direct single-task reconciliation call or a
central registry-based sweep. It does not own deployment-specific orchestration
or any provider-specific business workflow.

Broadly reusable crypto and HTTP request helpers live in `src/utils/`. This
feature keeps only incoming-hook-specific verification, wrapper, and bridge
logic local.

Implemented in v1:
- framework-neutral request, verifier, and verified-event contracts
- provider verifiers for Vercel, GitHub, and Stripe
- App Router and Pages Router wrappers, including
  `incomingHookPagesRouterConfig` for raw-body-safe Pages integrations
- a thin `TaskReconciler` bridge and example integrations for each supported
  source, covering both direct single-task reconciliation and central
  registry-based sweeps

## Implementation Constraints

- Keep the toolkit generic, copy-paste friendly, and framework-light.
- Lift broadly reusable helpers into `src/utils/` instead of duplicating local
  service utilities.
- Verify providers against the raw request body before JSON parsing.
- Pages Router integrations must disable body parsing so raw-body verification
  remains valid.
- Keep provider-specific business logic outside this feature.
- Leave `signature-utils.ts` scoped to its current anti-scraping use case.
- Accept secrets as arrays so rotations can happen without downtime.
- Require real `waitUntil` support for post-response execution mode.
- Keep `TaskReconciler` integration thin and caller-directed; caller code owns
  event filtering and decides whether to use direct single-task reconciliation
  or a central registry-based sweep.
- Keep service-ingress as a separate dependent service family.

## Public API / Contracts

- `IncomingHookProvider`
- `IncomingHookRequest`
- `VerifiedIncomingHook`
- `IncomingHookVerifier`
- `IncomingHookHandleResult`
- `IncomingHookHandlerMode`
- `RunVerifiedHookWithTaskReconcilerOptions`
- `createAppRouterIncomingHookHandler(...)`
- `createPagesRouterIncomingHookHandler(...)`
- `incomingHookPagesRouterConfig`
- `VercelWebhookVerifier`
- `GitHubWebhookVerifier`
- `StripeIncomingHookVerifier`
- `runVerifiedHookWithTaskReconciler(...)`
- `IncomingHookAuthError`
- `IncomingHookMethodError`
- `IncomingHookPayloadError`

## Known Tech Debt

- v1 does not add a replay-dedup or nonce store. Retries and redeliveries are
  expected, and idempotency remains the caller's responsibility, usually via
  `TaskReconciler`.

## What NOT To Do

- Do not turn this into a deployment orchestrator.
- Do not parse JSON before verifying signatures.
- Do not reuse `src/utils/signature-utils.ts` for provider webhook auth.
- Do not move Stripe billing or sync logic into this package.
- Do not assume provider delivery IDs alone provide replay protection.
- Do not simulate durable post-response work when `waitUntil` is unavailable.
- Do not absorb typed internal service ingress into this feature. That belongs
  in `src/services/service-ingress/`.
