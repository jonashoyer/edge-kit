# [0023] Use a dedicated Deep Research service for Gemini Interactions API agents

**Status:** `Implemented`

**Date:** 2026-04-24

---

## TL;DR

Edge Kit adds `src/services/deep-research/` as a dedicated service family for
long-running Deep Research jobs, with an initial Gemini provider backed by the
raw Gemini Interactions API over `fetchExt`. Deep Research is not modeled as an
AI SDK `LanguageModel`, because Gemini exposes it as an asynchronous agent
lifecycle with stored background interactions rather than a single
request/response generation call.

---

## Decision

Edge Kit introduces `src/services/deep-research/` as a standalone service
family for async research-agent orchestration. The base contract lives in
`src/services/deep-research/abstract-deep-research.ts`, and the first concrete
provider lives in
`src/services/deep-research/gemini-deep-research.ts`.

The public service contract models the lifecycle explicitly:

- `startResearch(...)` creates a stored background research interaction.
- `getResearch(...)` reads the current interaction state.
- `waitForCompletion(...)` polls until completion, required action, failure,
  timeout, or cancellation signal.
- `continueResearch(...)` sends follow-up input from a previous interaction.

The abstract service also exposes short `start(...)`, `get(...)`, and
`wait(...)` aliases for callers that prefer the lifecycle verbs without the
service-family suffix.

The Gemini implementation must call the Gemini Interactions API directly using
the existing `fetchExt` utility rather than adding `@google/genai`. It must
configure Deep Research runs with `background: true` and `store: true`, and
support the Gemini agent ids `deep-research-preview-04-2026` and
`deep-research-max-preview-04-2026`.

The service will expose typed inputs, tools, AI SDK-compatible `UIMessage`
outputs, lifecycle states, and error classes so applications can persist job
ids, resume polling, render results with the existing AI stack, and handle
Gemini-specific failures without binding the rest of the app to Gemini response
shapes.

### Alternatives Considered

- **Expose Gemini Deep Research as an AI SDK `LanguageModel`:** Rejected because
  Deep Research is an async Interactions API agent lifecycle, not a synchronous
  or streaming language-model generation contract.
- **Add the Gemini provider under `src/services/llm/`:** Rejected because `llm`
  owns generic AI SDK diagnostics and provider-adjacent helpers, while Deep
  Research owns job lifecycle, polling, continuation, and stored interaction
  semantics.
- **Use `@google/genai`:** Rejected for the initial provider because raw REST via
  `fetchExt` keeps the module dependency-light, transparent, and consistent
  with existing copy-paste-first HTTP service implementations.
- **Implement only a Gemini-specific helper:** Rejected because the lifecycle
  shape is reusable across future Deep Research providers even though Gemini is
  the first implementation.

---

## Constraints

- All Deep Research contracts and provider implementations MUST live under
  `src/services/deep-research/`.
- The base abstraction MUST model `startResearch`, `getResearch`,
  `waitForCompletion`, and `continueResearch` as first-class lifecycle
  operations.
- The Gemini provider MUST use raw REST through `fetchExt`; do not add
  `@google/genai` for this service without a superseding ADR.
- Gemini Deep Research requests MUST use `background: true` and `store: true`
  because callers need durable interaction ids and resumable async state.
- The initial Gemini provider MUST support only
  `deep-research-preview-04-2026` and
  `deep-research-max-preview-04-2026` unless a later ADR expands the supported
  agent set.
- Do NOT adapt Deep Research to AI SDK `LanguageModel` or hide the async
  interaction lifecycle behind a single text-generation method.
- Tool definitions, tool calls, continuation inputs, AI SDK-compatible message
  outputs, lifecycle states, and provider errors MUST be typed at the service
  boundary.
- Deep Research MUST NOT be adapted to AI SDK `LanguageModel`, but completed
  artifacts SHOULD be exposed as AI SDK `UIMessage` / `UIMessagePart` values for
  UI, storage, and downstream compatibility.
- Preview Gemini response shapes MUST preserve unknown provider metadata while
  keeping Edge Kit's public interaction and output types stable.
- Implementations MUST NOT log API keys, private document contents, MCP
  headers, or raw provider payloads that may include sensitive research context.
- The service MUST remain dependency-light and copy-paste first; app-owned job
  persistence, queues, UI state, and scheduling stay outside the service family.

---

## Consequences

Positive: Edge Kit gains a reusable async research-job abstraction that matches
the provider lifecycle, keeps Gemini integration transparent, gives callers typed
hooks for polling, continuation, tools, and errors, and lets completed reports
flow through existing AI SDK message rendering/storage paths.

Negative: Callers must understand and persist the interaction lifecycle instead
of treating Deep Research like a normal text model call.

Tech debt deferred or created: richer queue integration, persistence adapters,
provider-agnostic result normalization beyond the initial output contract, and
additional Deep Research providers remain out of scope for the first iteration.

Observed tradeoff: using raw REST avoids a new SDK dependency and makes request
semantics explicit, but the service owns request/response validation, metadata
preservation, retry policy, timeout behavior, and preview API version tracking.

---

## Assumptions and Defaults

- Assumes Gemini Deep Research remains exposed through stored background
  Interactions API agents for the initial implementation window.
- Assumes `fetchExt` is the preferred Edge Kit primitive for typed HTTP calls
  with timeouts, retries, and JSON validation.
- Assumes applications, not Edge Kit, own durable job persistence and user-facing
  progress storage.
- Defaults the initial provider scope to Gemini's preview Deep Research agents:
  `deep-research-preview-04-2026` and
  `deep-research-max-preview-04-2026`.
- Defaults Gemini HTTP behavior to the `v1beta` API, 60 second request timeout,
  10 second poll interval, and transient HTTP retries.

---

## User Flow / Public API / Contract Changes

New public surface under `src/services/deep-research/`:

- `AbstractDeepResearchService`
- `DeepResearchStartInput`
- `DeepResearchGetInput`
- `DeepResearchWaitInput`
- `DeepResearchContinueInput`
- `DeepResearchInteraction`
- `DeepResearchStatus`
- `DeepResearchTool`
- `DeepResearchMessage`
- `DeepResearchMessageMetadata`
- `DeepResearchOutputPart`
- `DeepResearchProviderError`
- `DeepResearchError`
- `DeepResearchAgentMode`
- `DeepResearchAgentConfig`
- `GeminiDeepResearchService`
- `GeminiDeepResearchAgentId`
- `GeminiDeepResearchServiceOptions`
- `SUPPORTED_GEMINI_DEEP_RESEARCH_AGENT_IDS`

Expected usage shape:

```ts
const run = await deepResearch.startResearch({
  input: "Research durable TypeScript job orchestration patterns.",
  tools,
});

const completed = await deepResearch.waitForCompletion({
  id: run.id,
  timeoutMs: 120_000,
});

renderMessage(completed.message);
```

No HTTP API, UI flow, database schema, or queue contract is introduced by this
ADR.

---

## Related ADRs

- [ADR-0002] Add contextualizer, richer storage, and AI runtime support
- [ADR-0014] Use a dedicated transcription service family for local AI SDK
  Parakeet models
