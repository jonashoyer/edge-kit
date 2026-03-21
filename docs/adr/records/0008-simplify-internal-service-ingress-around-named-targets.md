# [0008] Simplify internal service ingress around named targets

**Status:** `Superseded`

**Date:** 2026-03-18

---

## TL;DR

Edge Kit keeps `src/services/incoming-hook/` as the home for verified inbound
HTTP requests, but simplifies the internal signed-request contract. Instead of
caller identity metadata such as service, environment, and tags, internal calls
now use a minimal typed service-ingress contract: ingress name, typed params,
an app-owned target map, and a shared secret per target endpoint.

---

## Decision

The internal request contract in `src/services/incoming-hook/` is simplified to
support one clear workflow:

- define an ingress contract with `name` and typed params
- map `(service, ingress)` to `{ url, secret }` in caller-owned config
- sign `POST` requests using method, pathname, timestamp, and raw body
- verify the request and dispatch to the bound ingress handler

This introduces:

- `ServiceIngress<TParams>`
- `defineServiceIngress(...)`
- `ServiceIngressTarget`
- `ServiceIngressMap`
- `resolveServiceIngressTarget(...)`
- `createServiceIngressHeaders(...)`
- `sendServiceIngress(...)`
- `createServiceIngressHandler(...)`
- `SignedServiceRequestVerifier`

The ingress name is sent in headers and must match the bound ingress contract
on the receiver before `execute(params)` runs.

### Alternatives Considered

- **Keep richer caller claims such as service, environment, and tags:**
  Rejected — it adds policy shape and authorization semantics that the user
  explicitly does not want in this phase.
- **Create a separate IPC or queue subsystem:**
  Rejected — the need is still verified HTTP ingress, not local runtime IPC or
  durable async orchestration.
- **Keep the old repo-specific naming for the signed request verifier:**
  Rejected — the internal contract should be generic and reusable.

---

## Constraints

- Keep this inside `src/services/incoming-hook/`; do not create a new service
  family for the typed internal contract.
- Keep the contract minimal and typed.
- Keep routing explicit and app-owned via a service ingress map.
- Verify the raw request body before parsing JSON.
- Keep secret rotation support in the low-level verifier.
- Do not introduce caller identity metadata or shared authorization policy in
  this phase.

---

## Consequences

Positive: internal service calls are easier to define, call, and receive with a
single typed contract and a straightforward target map.

Negative: authorization remains endpoint-secret based rather than caller-aware,
so more advanced policy and identity controls remain outside this phase.

---

## Assumptions and Defaults

- Internal service ingress uses `POST` with JSON payloads.
- One receiver handler instance is bound to one ingress contract.
- Each target endpoint has a shared secret configured by the consuming app.
- Caller apps own the target mapping artifact and its deployment-specific URLs.

---

## Superseded By

This decision was superseded on 2026-03-18 by ADR-0009, which moves
service-ingress into its own service family, replaces per-ingress handlers with
one shared endpoint, and removes target mapping in favor of direct target URLs.
