# [0014] Use a dedicated transcription service family for local AI SDK Parakeet models

**Status:** `Implemented`

**Date:** 2026-03-21

---

## TL;DR

Edge Kit now adds a new `src/services/transcription/` service family that
ships a copy-paste-first local transcription provider for AI SDK
`TranscriptionModelV3`, backed by a persistent Parakeet MLX runtime. This keeps
transcription-specific runtime orchestration out of `llm` and `utils`, while
imposing a clear constraint that local Parakeet support is a Node/macOS-focused
service with explicit runtime discovery and no hidden cloud fallback.

---

## Decision

Edge Kit introduces `src/services/transcription/` as a dedicated service
family for audio transcription contracts and provider implementations. The v1
implementation exposes an AI SDK-compatible local Parakeet model through
`@ai-sdk/provider` `TranscriptionModelV3`, with a provider surface that can be
used directly with `experimental_transcribe` from `ai`.

The shipped implementation is informed by Quasar's existing
`packages/speech/src/transcription/parakeet-mlx/transcription.ts`, but will be
reduced to the minimum copy-paste-ready shape needed for Edge Kit:

- a transcription-domain abstract contract in `src/services/transcription/`
- a concrete local Parakeet MLX runtime implementation in the same service
  family
- a small AI SDK-facing provider/model factory for one or more Parakeet model
  ids such as `mlx-community/parakeet-tdt-0.6b-v3`
- runtime process management for a persistent Python worker that loads
  `parakeet_mlx` once and serves `load`, `transcribe_file`, `ping`, and `quit`
  requests over a local stdio protocol
- temporary-file staging that writes AI SDK audio input into an ephemeral
  directory before handing the file path to the local runtime, then removes the
  directory after each call
- a transcription-focused `ProviderV3` surface that exposes
  `transcription(...)` and `transcriptionModel(...)`, while rejecting other
  model types with `NoSuchModelError`

This decision explicitly keeps the transcription service focused on local model
execution and AI SDK model compatibility. It will not be merged into
`src/services/llm/`, because that feature family already owns generic AI SDK
diagnostics and warm-up utilities rather than speech-to-text domain behavior.
It will not be placed in `src/utils/`, because runtime worker management,
provider contracts, audio normalization, and model-specific constraints are
domain behavior rather than cross-cutting generic helpers.

The initial provider targets local Parakeet MLX operation on macOS where the
runtime is proven in the source implementation. The service will surface this
as an explicit environment constraint instead of pretending the provider is
portable across unsupported platforms. No remote API fallback is implied by the
base contract.

### Alternatives Considered

- **Place local transcription under `src/services/llm/`:** Rejected because
  transcription runtime orchestration, audio handling, and model loading are a
  separate domain from generic AI SDK diagnostics and text-generation helpers.
- **Place Parakeet helpers in `src/utils/`:** Rejected because the worker
  protocol, model registry, and runtime constraints are provider/domain logic,
  not broadly reusable cross-cutting helpers.
- **Ship only a generic helper that returns plain transcript objects:** Rejected
  because the user goal is plug-and-play AI SDK transcription support, and the
  stable contract to target is `TranscriptionModelV3`.
- **Support remote providers and local Parakeet in the same initial ADR:**
  Rejected because it would broaden the public contract before the local model
  path and copy-paste boundaries are established.

---

## Constraints

- All transcription-specific contracts and provider implementations MUST live in
  `src/services/transcription/`. Do not add Parakeet runtime orchestration to
  `src/services/llm/` or `src/utils/`.
- The public model surface MUST target AI SDK `TranscriptionModelV3` so callers
  can use the result with `experimental_transcribe` without adapter code.
- The provider surface MAY accept provider-scoped options for compatibility,
  but unsupported options MUST surface explicit AI SDK warnings rather than
  silently pretending they were applied.
- The local Parakeet implementation MUST keep runtime constraints explicit. If
  support is limited to macOS and a local Python environment with
  `parakeet_mlx` and `mlx.core`, the provider must fail clearly instead of
  silently degrading to another backend.
- The implementation MUST remain copy-paste first: keep dependencies minimal,
  avoid package-wide abstractions, and do not require Edge Kit-specific
  registries or barrel files.
- The initial service family MUST NOT introduce streaming transcription,
  browser-runtime execution, or hidden network calls to remote transcription
  APIs.
- Audio preparation, temporary file handling, and runtime worker protocol logic
  MUST stay scoped to the transcription service family unless a later ADR
  establishes a broader reusable contract.
- Any future expansion to non-Parakeet local runtimes, remote transcription
  APIs, or non-macOS-first guarantees requires review and may require a
  superseding ADR if it changes these boundaries materially.

---

## Consequences

Positive: Edge Kit gains a clear copy-paste-ready transcription domain with a
provider shape that works directly with AI SDK transcription, which is the most
useful integration surface for adopters already standardizing on AI SDK.

Negative: The initial provider inherits meaningful runtime constraints from
Parakeet MLX and will not behave as a universal cross-platform transcription
solution out of the box.

Tech debt deferred or created: streaming support, richer provider options,
remote-provider parity, and broader platform support remain out of scope for
the first transcription service iteration.

Observed tradeoff: targeting AI SDK `TranscriptionModelV3` makes the provider
immediately useful but narrows the initial implementation toward AI SDK-aligned
result shapes instead of a broader speech processing abstraction.

Observed tradeoff: the provider accepts `parakeet.language` and
`parakeet.prompt` options for forward compatibility, but the shipped local
runtime does not apply them and instead returns explicit unsupported warnings.

Observed tradeoff: the runtime stays copy-paste friendly by using stdio plus
temporary files instead of introducing a richer audio pipeline abstraction, but
this means each call still incurs file staging and cleanup overhead.

---

## Assumptions and Defaults

- Assumes current Edge Kit consumers who want transcription support are more
  likely to want AI SDK compatibility than a framework-specific speech API.
- Assumes the most credible initial local implementation is the proven Quasar
  Parakeet MLX runtime flow rather than a new runtime path built from scratch.
- Assumes the first shipped model id will default to a Parakeet MLX model in
  the `mlx-community/parakeet-tdt-*` family. This proved correct; the shipped
  default is `mlx-community/parakeet-tdt-0.6b-v3`.
- Assumes local runtime health checks should be explicit and operationally
  visible rather than hidden behind best-effort fallback behavior.

---

## User Flow / Public API / Contract Changes

New public surface under `src/services/transcription/`:

- an abstract transcription-domain contract for local providers/models
- a Parakeet MLX AI SDK transcription model implementation
- a local runtime implementation
- a provider/factory entry point that can be used like:

```ts
import { experimental_transcribe as transcribe } from 'ai';
import { parakeet } from './src/services/transcription/parakeet-local-provider';

const result = await transcribe({
  model: parakeet.transcription('mlx-community/parakeet-tdt-0.6b-v3'),
  audio,
});
```

Expected result contract:

- `text`
- `segments` with `startSecond` and `endSecond`
- optional `language`
- optional `durationInSeconds`
- provider warnings and response metadata shaped for AI SDK

Implemented supporting surface:

- `AbstractLocalTranscriptionRuntime`
- `AbstractAiSdkTranscriptionModel`
- `ParakeetLocalRuntime`
- `ParakeetLocalTranscriptionModel`
- `createParakeetTranscriptionProvider(...)`
- `parakeet`
- `SUPPORTED_PARAKEET_MODEL_IDS`
- `DEFAULT_PARAKEET_MODEL_ID`

No HTTP API or UI flow changes are part of this ADR.

---

## Related ADRs

- [ADR-0002] Add contextualizer, richer storage, and AI runtime support
