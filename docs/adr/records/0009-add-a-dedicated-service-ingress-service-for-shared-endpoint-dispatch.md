# [0009] Add a dedicated service-ingress service for shared-endpoint dispatch

**Status:** `Implemented`

**Date:** 2026-03-18

---

## TL;DR

Edge Kit moves typed internal service ingress out of
`src/services/incoming-hook/` into a dedicated `src/services/service-ingress/`
service family. Internal calls now use a single shared endpoint per receiving
service, dispatch by signed ingress name, and pass the target URL directly
instead of relying on an app-owned target map.

---

## Decision

Edge Kit implements `src/services/service-ingress/` as the home for typed
internal service-to-service ingress. `incoming-hook` remains a dependency for
generic verified-request contracts and route-wrapper infrastructure only.

The new service-ingress workflow is:

- define one or more `ServiceIngress<TParams>` contracts with a `name` and
  optional `execute`
- expose one shared endpoint that binds a list of ingresses
- dispatch incoming signed requests by the ingress name in headers
- call services directly with `url + secret + ingress + params`

This introduces:

- `ServiceIngress<TParams>`
- `defineServiceIngress(...)`
- `createServiceIngressHeaders(...)`
- `sendServiceIngress(...)`
- `dispatchServiceIngress(...)`
- `createServiceIngressHandler(...)`
- `createPagesRouterServiceIngressHandler(...)`
- `serviceIngressPagesRouterConfig`
- `SignedServiceRequestVerifier`

The shared-endpoint handler rejects duplicate ingress names at construction
time. Unknown ingress names return `401`. JSON is parsed only after raw-body
signature verification succeeds.

### Alternatives Considered

- **Keep service-ingress inside `incoming-hook`:**
  Rejected — the internal typed ingress workflow is a separate service concern,
  while `incoming-hook` should stay focused on generic inbound verification.
- **Keep one endpoint per ingress handler:**
  Rejected — the desired contract is one shared internal endpoint that dispatches
  by ingress name.
- **Keep service/ingress target mapping:**
  Rejected — caller code should pass the exact target URL directly rather than
  model service discovery in Edge Kit.

---

## Constraints

- `src/services/service-ingress/` owns the public internal ingress API.
- `src/services/incoming-hook/` keeps only generic verified-request primitives
  and external-provider integrations.
- Sender API takes `url + secret + ingress + params` directly.
- Receiver API binds many ingresses to one handler and dispatches by signed
  ingress name.
- Raw body must be verified before JSON parsing.
- Secret rotation is supported on the receiving side through `secrets: string[]`.
- `execute` remains optional and may return a JSON-compatible transport body
  when a handler needs to surface structured results.

---

## Consequences

Positive: internal service ingress now has a cleaner ownership boundary, a
simpler sender API, and a shared-endpoint receiver model that better matches
how internal services are expected to expose one operational route.

Negative: the just-added service-ingress surface inside `incoming-hook` becomes
a breaking cleanup rather than a compatibility layer.

---

## Assumptions and Defaults

- One route endpoint handles many ingress contracts.
- Caller code owns the exact target URL.
- Transport responses stay generic by default, but handlers may return
  structured JSON bodies when the caller needs sweep or execution details.
- More advanced policy, discovery, and workflow orchestration remain out of
  scope for this phase.
