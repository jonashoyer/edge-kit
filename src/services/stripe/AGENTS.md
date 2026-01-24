# src/services/stripe/

Stripe billing domain (B2B + subscriptions + webhooks), with local docs and examples.

## Structure

- `index.ts`: barrel export for the Stripe domain
- `examples/`: copy-paste handlers/APIs (checkout, webhook, success handlers)
- `docs/`: Stripe-specific implementation notes/playbooks

## Where to look

| Task                          | File/dir                                          |
| ----------------------------- | ------------------------------------------------- |
| Domain public API             | `index.ts`                                        |
| Webhook verification/handling | `webhook-service.ts`, `examples/webhook-api.ts`   |
| Checkout flows                | `checkout-service.ts`, `examples/checkout-api.ts` |
| Subscriptions                 | `subscription-service.ts`                         |
| KV-backed stores/keys         | `kv-store.ts`, `stripe-keys.ts`                   |
| B2B support                   | `b2b-service.ts`, `kv-b2b-store.ts`               |
| Operational guidance          | `README.md`, `docs/stripe_playbook.md`            |

## Hard rules (from local docs)

- Always create a customer before starting checkout (`README.md`).
- Always create checkout with a `stripeCustomerId` (`docs/stripe_playbook.md`).
- Webhook handlers should return 2xx quickly; do work async if needed (`examples/webhook-api.ts`).

## Gotchas

- `docs/stripe_playbook.md` contains some non-repo-relative links/paths (e.g. `src/server/...`) from upstream notes.
