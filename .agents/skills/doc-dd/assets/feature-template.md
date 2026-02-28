# Feature: [Feature Name]
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  Use the canonical product/domain name for this feature — match what it's
  called in the codebase, not marketing copy.
  BAD:  "New Checkout Experience"
  GOOD: "Checkout — Payment Flow"
  This name should be consistent across FEATURE.md, ADRs, and PRDs.
-->

**Status:** `Active` | `Stable` | `Frozen` | `Deprecated`
<!--
  REQUIRED | Update in-place.
    Active      — currently being developed or frequently changed
    Stable      — in production, changes are infrequent and deliberate
    Frozen      — no new feature work permitted; bug fixes only
    Deprecated  — scheduled for removal; reference the replacing feature or ADR
-->

**Last Reviewed:** YYYY-MM-DD
<!--
  REQUIRED | Update whenever a meaningful change is made.
  Staleness threshold: 90 days — flagged by CI if exceeded.
-->

**Related ADRs:** [ADR-NNNN], [ADR-NNNN]
<!--
  REQUIRED if applicable. Link every ADR that governs or constrains this feature.
  An agent must read these before touching this feature area.
-->

**PRD:** [link]
<!--
  OPTIONAL | Link to the originating ticket or PRD or spec document for historical context.
  Do not treat this as a source of truth for current behavior —
  the sections below supersede it.
-->

---

## What This Does
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  2–4 sentences. Describe what this feature does in plain language —
  what problem it solves and which users or systems it serves.
  Write for a developer or AI agent with zero prior context.

  Must include:
    - The core responsibility of this feature
    - The primary user or system actor it serves
    - What it explicitly does NOT handle (scope boundary)

  Example:
    "Handles all user identity for the platform — JWT issuance, session
    management, and OAuth provider integrations. Serves all client-facing
    applications and internal services that require authenticated requests.
    Does not handle authorization (role/permission checks) — see /services/rbac."
-->

---

## Key Goals
<!--
  REQUIRED | 🟡 MEDIUM WEIGHT
  The north star principles this feature is built around. Future changes
  must continue to serve these goals — if a proposed change conflicts with
  a goal here, it needs explicit discussion and a new ADR.

  Write as short, declarative statements. 3–6 goals is the right range.

  Example:
    - Stateless authentication — no server-side session storage
    - Token issuance must be sub-50ms at p99
    - Zero direct DB access from outside this module
    - All OAuth flows must support PKCE
-->

---

## Implementation Constraints
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  The hard rules governing how this feature is implemented. Primary
  guardrails for any developer or AI agent working in this area.
  Write as explicit DO / DO NOT statements tied to concrete paths,
  methods, tables, or patterns.

  This is the most critical section for AI agent consumption — be
  specific, directive, and unambiguous.

  Example:
    - JWTs MUST be signed with RS256 — do not change the algorithm
    - Refresh tokens MUST be stored in HttpOnly cookies — never localStorage
    - DO NOT write auth logic inline in API routes — all auth goes through
      /services/auth
    - Rate limiting on /auth/login lives in edge middleware ONLY —
      do not introduce a second layer inside this module
    - The token blacklist uses Redis — do not swap for in-memory without a new ADR
-->

---

## Public API / Contracts
<!--
  CONDITIONAL — REQUIRED if this feature exposes any public surface area
  🔴 HIGHEST WEIGHT when present; omit entirely if fully internal

  Document all externally consumable surfaces this feature owns:
    - API endpoints (method, path, auth requirement, brief description)
    - Request/response shape (minimal schema or example payload)
    - Event contracts (emitted events, topic names, payload shape)
    - Webhooks or third-party integration points

  This section is the single source of truth for the feature's external
  contract. Update it before shipping any breaking change.

  Example:
    POST /auth/login
      Body:    { email: string, password: string }
      Returns: { access_token: string, expires_in: number }
      Sets:    HttpOnly cookie: refresh_token

    POST /auth/refresh
      Reads:   HttpOnly cookie: refresh_token
      Returns: { access_token: string, expires_in: number }

    Authorization header required on all authenticated routes:
      Authorization: Bearer <access_token>
-->

---

## Current State
<!--
  REQUIRED | 🟡 MEDIUM WEIGHT
  A snapshot of what is and isn't built right now. Prevents agents from
  building on top of something that doesn't exist or duplicating what does.

  Structure:
    **Implemented:** What is live and functional in production.
    **In progress:** What is actively being built (link to ticket).
    **Specced, not built:** What exists in a PRD or ADR but has no code yet.

  Example:
    Implemented: Google OAuth, GitHub OAuth, JWT issuance and refresh rotation
    In progress: Apple Sign-In (#412)
    Specced, not built: MFA (see ADR-0007), SSO/SAML
-->

---

## Known Tech Debt
<!--
  OPTIONAL (strongly recommended for Stable and Frozen features)
  🟡 MEDIUM WEIGHT

  Document shortcuts, deferred work, or known fragility. Be specific —
  include file paths or function names where relevant. Prevents agents
  from building on top of fragile foundations without awareness.

  Example:
    - MFA is stubbed at /auth/mfa/index.ts but not wired — do not treat
      this path as functional
    - Token blacklist only runs in production — staging uses an in-memory mock
    - OAuth state parameter validation is incomplete — tracked in #389
-->

---

## What NOT To Do
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  Explicit anti-patterns and forbidden actions for this feature. Exists to
  prevent the most common mistakes — especially those made before or likely
  given the feature's complexity.

  Write as direct prohibitions. Reference file paths or patterns where
  possible so an agent can pattern-match against its planned changes.

  Example:
    - Do not bypass this module and write auth logic directly in API routes
    - Do not add new OAuth providers without first creating a new ADR
    - Do not touch /services/auth/legacy — Frozen, handles existing SSO only
    - Do not store user identity data outside the /services/auth boundary
-->

---

## Dependencies
<!--
  OPTIONAL | 🟡 MEDIUM WEIGHT
  Internal services, external APIs, and infrastructure this module depends on.
  Helps an agent understand blast radius before making changes.

  Format: [Type] Name — what it's used for
  Example:
    [Internal]       /services/rbac — role resolution on authenticated requests
    [Infrastructure] Redis — refresh token blacklist and rate limiting
    [External API]   Google OAuth 2.0 — identity provider
    [External API]   GitHub OAuth — identity provider
-->