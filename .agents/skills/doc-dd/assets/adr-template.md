# [NNNN] Title
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  Write as a declarative decision statement, not a topic label.
  BAD:  "Authentication"
  GOOD: "Use RS256-signed JWTs for stateless authentication"
  File name must match: 0001-use-rs256-jwt-auth.md
-->

**Status:** `Draft` | `Implemented` | `Deprecated` | `Superseded by [NNNN]`
<!--
  REQUIRED | Update in-place as the ADR progresses.
  If superseded, always reference the replacing ADR number.
-->

**Date:** YYYY-MM-DD
<!--
  REQUIRED | Date the decision was finalized, not when drafting began.
-->

---

## TL;DR
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  2–3 sentences maximum. Written for someone who will not read the rest.
  This is the first thing an AI agent or new developer reads to determine
  whether this ADR is relevant to their current task.

  Must cover:
    1. What was decided
    2. The single biggest reason why
    3. The primary constraint it imposes on future work

  Example:
    "All authentication uses short-lived RS256-signed JWTs issued exclusively
    by /services/auth. Sessions and inline auth logic in API routes are
    forbidden. Any new OAuth provider requires a new ADR before implementation."
-->

---

## Decision
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  The full, directive statement of what was decided. Write as an explicit
  rule — not a description of a process or exploration.

  BAD:  "We evaluated JWT and sessions and chose JWT because it scales better."
  GOOD: "All authentication is handled via short-lived JWTs (15min TTL) issued
         by /services/auth. No server-side sessions are permitted. Auth logic
         must not be written inline in API routes."

  Must include:
    - What tool, pattern, or approach was chosen
    - Where it lives in the codebase (file path or module name)
    - Any version or configuration specifics that affect implementation
-->

### Alternatives Considered
<!--
  REQUIRED | 🟡 MEDIUM WEIGHT
  List every option that was evaluated and the one-line reason it was rejected.
  This prevents future teams and agents from re-opening the same debate.
  Minimum 2 alternatives. Bullet format is sufficient.

  Example:
    - **Server-side sessions (Redis):** Rejected — introduces stateful infra
      dependency that complicates horizontal scaling.
    - **HS256 JWTs:** Rejected — symmetric key makes secret rotation risky
      across distributed services.
-->

---

## Constraints
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  The hard guardrails this decision imposes on all future development.
  These are the lines no developer or AI agent should cross without
  first creating a superseding ADR.

  Write as explicit DO / DO NOT statements wherever possible.
  Be specific about file paths, table names, API routes, or patterns
  that are in or out of scope.

  Example:
    - DO NOT store refresh tokens in localStorage — HttpOnly cookies only
    - DO NOT write directly to the `payments` table outside /services/payment
    - All new OAuth providers MUST have a dedicated ADR approved before
      any implementation begins
    - Rate limiting on /auth/login is handled at the edge (middleware only) —
      do not add a second layer inside this module
-->

---

## Consequences
<!--
  REQUIRED | 🟡 MEDIUM WEIGHT
  An honest register of what becomes easier, harder, or impossible as a
  result of this decision. Do not write this as a sales pitch — surface
  the real tradeoffs.

  Structure:
    **Positive:** What this decision improves or enables.
    **Negative:** What becomes harder, slower, or constrained.
    **Tech debt deferred or created:** Any known shortcuts or future
      work this decision kicks down the road.

  Example:
    Positive: Stateless auth simplifies horizontal scaling — no session
    store to synchronize.
    Negative: Short TTLs require robust refresh token handling on all clients.
    Tech debt: MFA is stubbed at /auth/mfa but not wired — see ADR-0007.
-->

---

## Assumptions and Defaults
<!--
  OPTIONAL (recommended for infrastructure or cross-cutting decisions)
  🟡 MEDIUM WEIGHT

  Document what this decision assumes to be true about the environment,
  team, stack, or codebase at the time it was made. If any assumption
  changes, this ADR should be reviewed for continued validity.

  Also list any configurable defaults introduced by this decision and
  where they can be overridden.

  Example:
    - Assumes Redis is available in all environments for token blacklisting
    - Assumes single-region deployment — revisit if multi-region is adopted
    - Default JWT TTL is 15min; overridable via AUTH_TOKEN_TTL env var
    - Assumes all clients support HttpOnly cookies (no native mobile clients
      at time of decision)
-->

---

## Implementation Plan
<!--
  OPTIONAL (include when Status = Draft; collapse or remove once Implemented)
  🟢 LOW WEIGHT

  A brief ordered list of steps needed to ship this decision. Not a full
  ticket breakdown — just enough for an agent or developer to understand
  sequencing and dependencies before starting work.

  Remove or archive this section once the ADR reaches Implemented status
  to keep the document clean for future readers.

  Example:
    1. Scaffold /services/auth with JWT issuance and refresh rotation
    2. Migrate existing session-based routes to accept Bearer tokens
    3. Update API gateway middleware to validate RS256 signatures
    4. Deprecate and remove legacy session store after 2-sprint cutover
-->

---

## User Flow / Public API / Contract Changes
<!--
  CONDITIONAL — REQUIRED if this decision touches any public surface area
  🔴 HIGHEST WEIGHT when present; omit entirely if no public changes

  Document any changes to:
    - Public API endpoints (method, path, request/response shape)
    - Auth contracts (token structure, headers, cookie names)
    - UI flows that change as a result of this decision
    - External integrations, webhooks, or third-party contracts

  Use a before/after format or a minimal schema snippet.
  If there are zero public-facing changes, delete this section.

  Example:
    Before: POST /login → sets session cookie (connect.sid)
    After:  POST /auth/login → returns { access_token, expires_in }
            + sets HttpOnly refresh_token cookie

    New header required on all authenticated requests:
      Authorization: Bearer <access_token>
-->

---

## Related ADRs
<!--
  OPTIONAL | 🟢 LOW WEIGHT
  Link to ADRs this decision depends on, supersedes, or is commonly
  read alongside. Especially useful at scale when agents traverse the
  ADR index to build context.

  Format: [ADR-NNNN] Short title of related decision
  Example:
    - [ADR-0002] Use PostgreSQL as primary data store
    - [ADR-0007] MFA implementation deferred to Phase 2
-->
