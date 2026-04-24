# Feature: Deep Research Services

Status: Active
Last Reviewed: 2026-04-24

## Current State

`src/services/deep-research/` provides a provider-neutral lifecycle contract for
long-running research agents plus a Gemini Deep Research provider backed by the
Gemini Interactions API.

Gemini Deep Research is implemented as a stored async interaction. Callers start
a background job, persist the interaction id, poll or wait for status, and
optionally continue from a previous interaction for collaborative planning or
follow-up turns. The contract supports text, image, and document inputs; provider
tools including Google Search, URL context, code execution, MCP servers, and file
search; AI SDK-compatible `UIMessage` output parts for text, files, reasoning,
sources, and custom preview data; and typed provider, timeout, abort,
failed-status, and unsupported-agent errors.

## Implementation Constraints

- Keep Deep Research separate from `src/services/llm/`; it is an agent lifecycle,
  not an AI SDK `LanguageModel`.
- Keep provider implementations dependency-light and copy-paste-friendly.
- Use `fetchExt` for Gemini REST calls unless a superseding ADR permits an SDK.
- Gemini requests must use `background: true` and `store: true`.
- Do not log API keys, private documents, MCP headers, or raw provider payloads
  that may contain sensitive research context.
- Treat Gemini response shapes as preview API data: preserve unknown metadata,
  but keep the Edge Kit boundary typed.

## Public API / Contracts

- `AbstractDeepResearchService`
- `DeepResearchAgentConfig`
- `DeepResearchAgentMode`
- `DeepResearchContinueInput`
- `DeepResearchCodeExecutionTool`
- `DeepResearchDataParts`
- `DeepResearchDocumentInputPart`
- `DeepResearchError`
- `DeepResearchErrorCode`
- `DeepResearchFileSearchTool`
- `DeepResearchGetInput`
- `DeepResearchGoogleSearchTool`
- `DeepResearchImageInputPart`
- `DeepResearchImageOutput`
- `DeepResearchInput`
- `DeepResearchInputPart`
- `DeepResearchInteraction`
- `DeepResearchKnownStatus`
- `DeepResearchMessage`
- `DeepResearchMessageMetadata`
- `DeepResearchMcpServerTool`
- `DeepResearchOutputPart`
- `DeepResearchProviderError`
- `DeepResearchStartInput`
- `DeepResearchStatus`
- `DeepResearchTextInputPart`
- `DeepResearchTool`
- `DeepResearchTools`
- `DeepResearchUrlContextTool`
- `DeepResearchVisualization`
- `DeepResearchWaitInput`
- `GeminiDeepResearchService`
- `GeminiDeepResearchServiceOptions`
- `GeminiDeepResearchAgentId`
- `SUPPORTED_GEMINI_DEEP_RESEARCH_AGENT_IDS`

## What NOT To Do

- Do not hide polling behind a synchronous text-generation helper.
- Do not add queue, database, or UI persistence here; applications own durable
  job storage and presentation state.
- Do not add barrel files for this service family.
- Do not expand supported Gemini agent ids without checking current provider
  docs and updating tests/docs.
