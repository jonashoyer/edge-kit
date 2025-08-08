# Optimistic LLM Service

A lightweight service to proactively warm upstream LLM provider token caches (e.g., OpenAI/Azure) based on a prompt prefix, so real user requests are faster.

## Install & Setup

Place your preferred `AbstractKeyValueService` implementation (e.g., Upstash Redis). This service uses AI SDK directly for warm-ups.

```ts
import { createOpenAI } from '@ai-sdk/openai';
// Example: AI SDK (Vercel) with OpenAI provider
// npm i ai @ai-sdk/openai
import { streamText } from 'ai';

import { UpstashRedisKeyValueService } from '../key-value/upstash-redis-key-value';
import { OptimisticLlmService } from './optimistic-llm';

const kv = new UpstashRedisKeyValueService(process.env.UPSTASH_REDIS_URL!, process.env.UPSTASH_REDIS_TOKEN!);
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const optimistic = new OptimisticLlmService(kv, {
  ttlSeconds: 300, // 5 minutes
  minCachedTokens: 1024,
  streamText: (args) => streamText(args),
  getModel: (model) => openai(model ?? 'gpt-4o-mini'),
});
```

## Usage

When you are reasonably certain a user is about to send a prompt, call `warmIfNeeded` with a prefix string (you decide how to build it – e.g., system prelude + the first N chars of the user text):

```ts
const prefix = `You are a helpful assistant. Summarize this document in 5 bullet points.`;
await optimistic.warmIfNeeded(prefix, { model: 'gpt-4o-mini', user: 'tenant-123' });
```

Internally, if no recent warm entry exists for the prefix, the service triggers a minimal provider call by appending `DO NOT REPLY TO THIS MESSAGE` to the prefix. The service then stores a short-lived key so subsequent real calls occur against a warmed cache.

## API

- `isWarm(prefix, model?, user?) => Promise<boolean>`: checks if the prompt prefix was warmed recently.
- `warmIfNeeded(prefix, { model?, user?, signal?, force? }) => Promise<void>`: warms the prefix if missing.

## Notes

- Token count is estimated (≈ 4 chars/token) and compared with `minCachedTokens`.
- Pass a `user` to align with provider routing for shared prefixes.
- Errors from the warm strategy are swallowed to avoid affecting UX; on failure the prefix is not marked warm.
- Works with AI SDK directly via `streamText` and `getModel`.
