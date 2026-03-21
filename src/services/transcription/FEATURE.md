# Feature: Transcription Services

Status: Active
Last Reviewed: 2026-03-21
Related ADRs: [ADR-0014](/Users/j/Documents/projects/edge-kit/docs/adr/records/0014-use-a-dedicated-transcription-service-family-for-local-ai-sdk-parakeet-models.md)

## Current State

`src/services/transcription/` provides copy-paste-first local transcription
primitives for AI SDK consumers. The initial implementation exposes a local
Parakeet MLX runtime as an AI SDK `TranscriptionModelV3` plus a small provider
factory that can be used directly with `experimental_transcribe` from `ai`.
Audio input is staged to temporary files, then forwarded to a persistent local
Python worker over stdio so the Parakeet model can stay warm within one Node
process. The shipped provider supports the Parakeet MLX v2 and v3 model ids,
fails explicitly outside macOS or without a usable local `parakeet_mlx`
runtime, and returns unsupported warnings for provider options that are not yet
applied by the local worker.

## Implementation Constraints

- Keep transcription-specific runtime orchestration inside this feature family.
- Keep the public model surface aligned to AI SDK `TranscriptionModelV3`.
- Keep local runtime constraints explicit; do not hide unsupported platforms or
  missing `parakeet_mlx`/`mlx.core` runtimes behind silent fallback behavior.
- Keep the module copy-paste friendly and dependency-light.
- Keep runtime access file-path based at this boundary; AI SDK byte inputs are
  normalized into temporary files before the local worker is invoked.
- Keep the local worker protocol limited to `ping`, `load`, `transcribe_file`,
  and `quit` unless a new reviewed need expands the contract.

## Public API / Contracts

- `AbstractLocalTranscriptionRuntime`
- `AbstractAiSdkTranscriptionModel`
- `ParakeetLocalRuntime`
- `ParakeetLocalRuntimeOptions`
- `ParakeetLocalTranscriptionModel`
- `ParakeetLocalTranscriptionError`
- `ParakeetLocalTranscriptionErrorCode`
- `ParakeetTranscriptionProviderOptions`
- `createParakeetTranscriptionProvider(...)`
- `parakeet`
- `SUPPORTED_PARAKEET_MODEL_IDS`
- `DEFAULT_PARAKEET_MODEL_ID`

## Known Tech Debt

- `providerOptions.parakeet.language` and `providerOptions.parakeet.prompt`
  currently produce AI SDK warnings but are not forwarded into the Python
  runtime yet.
- The local runtime is covered by focused unit tests with fake runtimes and
  platform probes, but this feature does not yet ship a live Parakeet-backed
  integration test in Edge Kit.

## What NOT To Do

- Do not move Parakeet runtime process management into `src/services/llm/`.
- Do not push provider-specific runtime logic into `src/utils/`.
- Do not add hidden cloud fallbacks to the local provider contract.
- Do not assume browser or non-macOS runtime support in this feature without a
  new reviewed decision.
- Do not bypass the model/provider surface and embed ad hoc Python process
  spawning in unrelated features.
