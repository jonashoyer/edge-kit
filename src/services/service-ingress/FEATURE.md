# Feature: Service Ingress

Status: Active
Last Reviewed: 2026-03-20
Related ADRs: 0009

## Current State

`src/services/service-ingress/` provides typed internal service-to-service
ingress for signed JSON `POST` requests over one shared endpoint.

It owns the ingress contract, direct sender helper, signed-request verifier,
shared-endpoint dispatch, and thin App Router / Pages Router handlers. It
depends on `src/services/incoming-hook/` only for the generic verified-request
contracts and route-wrapper primitives.

Implemented in v1:
- `ServiceIngress<TParams>` contracts with `name` and optional `execute`
  result bodies
- direct sender API with `url + secret + ingress + params`
- one shared endpoint that dispatches by signed ingress name
- HMAC verification with timestamp drift checks and secret rotation on the
  receiving side
- App Router and Pages Router handler helpers
- optional service-specific JSON response bodies from `execute`, including
  task reconciliation sweep summaries

## Implementation Constraints

- Keep this as its own service family under `src/services/service-ingress/`.
- Keep the contract minimal: ingress name, typed params, and optional execute
  handler with an optional JSON response body.
- Do not add target mapping, service discovery, environment policy, or caller
  identity metadata in this phase.
- Verify the raw request body before parsing JSON.
- Return `401` for unknown ingress names and signature failures.
- Reject duplicate ingress names at handler construction time.
- Keep the transport response minimal and generic when `execute` returns
  nothing.
- Allow `execute` to return a plain JSON-serializable body when the ingress
  needs to surface structured results.

## Public API / Contracts

- `ServiceIngress`
- `defineServiceIngress(...)`
- `createServiceIngressHeaders(...)`
- `sendServiceIngress(...)`
- `dispatchServiceIngress(...)`
- `createServiceIngressHandler(...)`
- `createPagesRouterServiceIngressHandler(...)`
- `serviceIngressPagesRouterConfig`
- `SignedServiceRequestVerifier`

## What NOT To Do

- Do not turn this into service discovery or endpoint registry infrastructure.
- Do not add per-ingress dedicated route helpers in this phase.
- Do not parse JSON before verifying signatures.
- Do not add transport-specific envelopes or HTTP metadata to `execute`
  return values.
