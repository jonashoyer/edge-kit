# Deep Research Services

Edge Kit includes a provider-neutral Deep Research lifecycle under
`src/services/deep-research/` and a Gemini implementation for the Gemini
Interactions API.

Use this for research jobs that take minutes: market analysis, literature
reviews, due diligence, competitive landscapes, and other workflows that need a
plan, search/read iterations, and a cited report.

## Gemini Setup

```ts
import { GeminiDeepResearchService } from "../../src/services/deep-research/gemini-deep-research";

const deepResearch = new GeminiDeepResearchService({
  apiKey: process.env.GEMINI_API_KEY!,
});
```

The provider uses raw REST through `fetchExt`, so there is no Gemini SDK
dependency to install.

## Start And Poll

```ts
const started = await deepResearch.startResearch({
  input: "Research the competitive landscape for browser automation agents.",
  agentConfig: {
    thinkingSummaries: "auto",
  },
});

const current = await deepResearch.getResearch({ id: started.id });
```

Persist `started.id` in your app if the job can outlive the current request.
Gemini Deep Research runs as a stored background interaction.

## Wait For Completion

```ts
const completed = await deepResearch.waitForCompletion({
  id: started.id,
  pollIntervalMs: 10_000,
  timeoutMs: 20 * 60_000,
});

const report = completed.text;

for (const part of completed.message.parts) {
  if (part.type === "source-url") {
    console.log(part.url);
  }
}
```

`waitForCompletion` throws `DeepResearchError` with code `FAILED`, `TIMEOUT`, or
`ABORTED` when the lifecycle does not complete successfully.

## AI SDK Message Output

Deep Research keeps its async lifecycle fields on `DeepResearchInteraction`, but
normalizes completed artifacts into an AI SDK `UIMessage`:

```ts
const completed = await deepResearch.waitForCompletion({ id: started.id });

completed.message.role; // "assistant"
completed.message.parts; // AI SDK UIMessagePart[]
completed.text; // convenience concatenation of text parts
```

Gemini output parts map to AI SDK UI parts:

- text outputs become `text` parts
- generated images become `file` parts with a data URL or hosted URL
- thought summaries become `reasoning` parts
- citations and sources become `source-url` or `source-document` parts when the
  provider returns enough metadata
- unknown preview output shapes become `data-deep-research-output` custom data
  parts

## Collaborative Planning

```ts
const plan = await deepResearch.startResearch({
  input: "Research the state of local-first sync engines.",
  agentConfig: {
    thinkingSummaries: "auto",
    collaborativePlanning: true,
  },
});

const refined = await deepResearch.continueResearch({
  previousInteractionId: plan.id,
  input: "Focus on TypeScript-friendly systems and operational tradeoffs.",
  agentConfig: {
    thinkingSummaries: "auto",
    collaborativePlanning: true,
  },
});

const finalRun = await deepResearch.continueResearch({
  previousInteractionId: refined.id,
  input: "Plan looks good. Run the research.",
  agentConfig: {
    thinkingSummaries: "auto",
    collaborativePlanning: false,
  },
});
```

## Tools

By default, Gemini enables Google Search, URL Context, and Code Execution. Pass
`tools` to restrict or extend the available tools.

```ts
const run = await deepResearch.startResearch({
  input: "Compare our FY2025 report against current public news.",
  tools: [
    { type: "google_search" },
    {
      type: "file_search",
      fileSearchStoreNames: ["fileSearchStores/company-reports"],
    },
    {
      type: "mcp_server",
      name: "Deployment Tracker",
      url: "https://mcp.example.com/mcp",
      headers: {
        Authorization: `Bearer ${process.env.DEPLOYMENT_MCP_TOKEN}`,
      },
      allowedTools: ["deployment_status"],
    },
  ],
});
```

Avoid passing private documents or MCP tools that can expose sensitive data
unless your product flow is designed for that risk.

## Agent Modes

Gemini supports two Deep Research preview agents:

- `standard`: `deep-research-preview-04-2026`
- `max`: `deep-research-max-preview-04-2026`

```ts
const run = await deepResearch.startResearch({
  agentMode: "max",
  input: "Produce a comprehensive due diligence report on database branching.",
});
```
