# Edge Kit

Edge Kit is a comprehensive toolkit for TypeScript projects, designed to accelerate development with high-quality, copy-paste-ready components. Ideal for NextJS and other serverless platforms, Edge Kit prioritizes type safety, minimal dependencies, and architectural best practices.

## 🚀 Core Philosophy

Edge Kit is built with a **"copy-paste-first"** philosophy. Instead of installing a monolithic package, you copy exactly what you need into your project.

The MCP server follows the same contract: it returns source bundles that should
be copied into the target repository. It is not presenting Edge Kit as an
importable runtime package.

### Architecture Patterns

- **Abstract Base Classes**: Services typically define an abstract contract (e.g., `AbstractStorageService`), allowing you to swap implementations (e.g., S3 vs R2) without changing consuming code.
- **Dependency Injection**: Services receive their dependencies (loggers, clients) via the constructor, facilitating testing and flexibility.
- **Type Safety**: Heavy use of generics, conditional types, and utility types to ensure compile-time safety.

## 🏁 Getting Started

### Prerequisites

- Node.js (v18+)
- TypeScript (v5.0+)

### Usage Guide

1. **Browse**: Find the component you need in the `src` directory.
2. **Copy**: Copy the file(s) into your project (e.g., `src/services/storage/`).
3. **Install Dependencies**: Check the top of the file for required packages and install them.
   ```bash
   npm install @aws-sdk/client-s3 # Example for S3Storage
   ```
4. **Instantiate**:

   ```typescript
   // Example: Using the S3 Storage Service
   import { S3Storage } from "./services/storage/s3-storage";

   const storage = new S3Storage({
     bucket: process.env.AWS_BUCKET_NAME!,
     region: "us-east-1",
     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
   });
   ```

## 📦 Features & Services

### Billing

- [Stripe](./src/services/stripe/index.ts)

### Storage

- [S3](./src/services/storage/s3-storage.ts)
- [Cloudflare R2](./src/services/storage/r2-storage.ts)
- [Storage Asset Catalog](./src/services/storage-asset/abstract-storage-asset.ts)
- [Storage Asset Inventory](./src/services/storage-asset/storage-asset-inventory.ts)
- [Contextualizer](./src/services/contextualizer/index.ts)

### Key-Value Store

- [Upstash Redis](./src/services/key-value/upstash-redis-key-value.ts)
- [Ioredis](./src/services/key-value/ioredis-key-value.ts)
- [In-Memory](./src/services/key-value/in-memory-key-value.ts)

### Vector Database

- [Upstash Vector](./src/services/vector/upstash-vector-database.ts)

### RAG (Retrieval)

- [RAG Service](./src/services/rag/rag-service.ts): End-to-end chunking, indexing, and search.
- [Voyage Reranker](./src/services/rag/voyage-reranker.ts)
- [Contextualized Embeddings](./src/services/rag/contextualized-embedder.ts): (Voyage `voyage-context-3`)

### Logging & Alerting

- [Axiom Logger](./src/services/logging/axiom-logger.ts)
- [Alerting](./src/services/alerting/): Axiom, Slack, PagerDuty implementations.

### Analytics

- [PostHog](./src/services/analytics/posthog-analytics.ts)

### CRM

- [Apollo API](./src/services/crm/apollo-api.ts)

### Email Verification

- [ZeroBounce](./src/services/zerobounce/zerobounce-client.ts)

### LLM

- [AI cache middleware](./src/services/llm/ai-cache-middleware.ts)
- [Optimistic LLM warm-up](./src/services/llm/optimistic-llm.ts)
- [AI diagnostics](./src/services/llm/ai-diagnostics.ts)
- [Image generation](./src/services/image-generation/image-generation-service.ts):
  pure generation, optional storage persistence, and optional asset inventory
- [Local Parakeet transcription provider](./src/services/transcription/parakeet-local-provider.ts):
  AI SDK `experimental_transcribe` support for local Parakeet MLX runtimes

### Health

- [Health probe helpers](./src/services/health/index.ts)

### Operations & Coordination

- [Task Reconciler](./src/services/task-reconciler/index.ts): Central
  registry-based desired-vs-applied reconciliation for reindexing, backfills,
  cache rebuilds, and similar operational work.
- [Service Ingress](./src/services/service-ingress/index.ts): Typed internal
  service-to-service ingress over one shared signed endpoint.
- [Incoming Hook](./src/services/incoming-hook/index.ts): Verified inbound POST
  handling for Vercel, GitHub, and Stripe webhooks.

### Developer Tooling

- [Dev Launcher](./src/cli/dev-launcher/index.ts): Manifest-driven local
  dev launcher for repo and monorepo scripts plus TS-defined developer actions
  with a plain runner and Ink TUI.
- [Git Commit Report](./src/cli/git-commit-report/index.ts): Reusable CLI
  module for author- and time-bounded git commit context reports.

### Feature Flags & Waitlist

- [Client-side Feature Flag](./src/services/feature-flag/feature-flag.ts)
- [Key-Value Waitlist](./src/services/waitlist/key-value-waitlist.ts)

## 🖥️ Dev Launcher

Edge Kit now includes a generic manifest-driven dev launcher that can supervise
local scripts across a single-package repo or PNPM monorepo. Long-running
services stay in `dev-cli.config.json`, while one-shot developer actions live
in `dev-cli.actions.ts`. Both configs use keyed maps so ids are declared once
as object keys.

Run the example repo command:

```bash
pnpm cli dev
pnpm cli dev --preset default
pnpm cli dev --services tests
pnpm cli dev --no-tui
pnpm cli dev --actions-config ./dev-cli.actions.ts
pnpm cli action list
pnpm cli action list --json
pnpm cli action run install-deps
pnpm cli action run install-deps --force
```

Minimal `dev-cli.config.json`:

```json
{
  "version": 1,
  "packageManager": "pnpm",
  "servicesById": {
    "app": {
      "label": "App",
      "openUrl": "http://localhost:3000",
      "target": {
        "kind": "root-script",
        "script": "dev"
      }
    },
    "api": {
      "label": "API",
      "target": {
        "kind": "workspace-script",
        "packageName": "@repo/api",
        "script": "dev"
      }
    }
  },
  "presetsById": {
    "default": {
      "label": "Default",
      "serviceIds": ["app", "api"]
    }
  }
}
```

Minimal `dev-cli.actions.ts`:

```ts
import {
  defineDevActions,
  gitPullAction,
  installDepsAction,
} from './src/cli/dev-launcher';

export default defineDevActions({
  actionsById: {
    'git-pull': gitPullAction,
    'install-deps': installDepsAction,
  },
});
```

Edge Kit ships `gitPullAction` and `installDepsAction` from the dev-launcher
public entrypoint. `gitPullAction` fetches the tracked remote branch and only
becomes available when the current branch can be fast-forward pulled. If you
need to customize either action, start from
`src/cli/dev-launcher/actions/git-pull.ts` or
`src/cli/dev-launcher/actions/install-deps.ts` and keep `dev-cli.actions.ts` as
your repo-root registry entrypoint.

The TUI keeps the dashboard split for overview, but Enter on a selected
service opens a focused log mode that renders only that service log so scroll
and terminal text selection stay isolated. If a service defines `openUrl`, the
selected row also supports `o` to open that URL in your default browser.

Actions are CLI-only in this phase. `pnpm cli dev` evaluates only actions with
`suggestInDev: true` and prints advisory suggestions such as
`Action available before starting services: install-deps - run pnpm cli action run install-deps`.

Other action patterns can stay fully repo-local. Typical examples include:

- `db-push`: run a schema push only when generated SQL or migration state
  indicates it is needed.
- `db-migrate`: run a migration workflow and report a short summary.
- Custom Node or shell workflows using `ctx.exec(...)` or `ctx.pnpm(...)`.

## Git Commit Report

Edge Kit also includes a reusable git-history reporting command for collecting
committed changes by author within an explicit time range. The command shells
out to the local `git` binary, returns per-commit metadata plus line-change
stats, and can emit either human-readable text or JSON for downstream tooling.

Run the example repo command:

```bash
pnpm cli commits report --since "2026-03-01" --until "2026-03-19" --author "alice@example.com"
pnpm cli commits report --since "2026-03-01" --until "2026-03-19" --author "alice@example.com" --author "bob@example.com"
pnpm cli commits report --since "2026-03-01" --until "2026-03-19" --author "alice@example.com" --json
pnpm cli commits report --since "2026-03-01" --until "2026-03-19" --author "alice@example.com" --body --patch
```

Each commit entry includes:

- author name and email
- authored timestamp
- subject line
- files changed
- additions and deletions
- optional body and patch output when explicitly requested

## 🎼 Composers

Composers help structure complex logic in a type-safe way.

### [Namespace Composer](./src/composers/namespace-composer.ts)

Manage key-value namespaces (e.g., for Redis) with type safety.

```typescript
const ns = new NamespaceComposer({
  user: "users",
  session: (id: string) => `session:${id}`,
});
const key = ns.key("session", "123"); // "session:123"
```

### [Prompt Composer](./src/composers/prompt-composer.ts)

Build structured LLM prompts with template substitution and TOON-first data formatting.

```typescript
import { PromptComposer } from "./src/composers/prompt-composer";

const prompt = PromptComposer.composer(
  `
  Summarize these users:
  {{users}}
  `,
  {
    users: {
      data: [
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "editor" },
      ],
      converter: (data) => PromptComposer.format(data),
    },
  },
  {}
);
```

Primitive arrays render compactly:

```typescript
PromptComposer.format(["alpha", "beta", "gamma"]);
// [3]: alpha,beta,gamma
```

Uniform object arrays render as TOON tables:

```typescript
PromptComposer.format([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]);
// [2]{id,name}:
//   1,Alice
//   2,Bob
```

Nested objects stay structured without hand-written serializers:

```typescript
PromptComposer.format({
  team: { name: "Edge", active: true },
  tags: ["prompt", "toon"],
});
// team:
//   name: Edge
//   active: true
// tags[2]: prompt,toon
```

Use `PromptComposer.format(data, { format: "xml" })` when your prompt contract is XML-specific.
Use `mdSchema()` from `markdown-utils.ts` when you need schema-driven Markdown/XML presentation rather than compact raw data encoding.

## 🧰 Utilities

High-quality, focused utility functions located in `src/utils/`.

- **[Markdown Schema](./src/utils/markdown-utils.ts)**: Render structured data to Markdown/XML for AI prompts.
  ```typescript
  import { mdSchema } from "./utils/markdown-utils";
  const schema = mdSchema<User>({
    name: { format: "bold" },
    email: { format: "code" },
  });
  const md = schema.build(user); // "**name**: Alice\n`email`: alice@example.com"
  ```
- **[Try/Catch](./src/utils/try-catch-utils.ts)**: Go-style error handling.
  ```typescript
  const [error, result] = await tryCatch(asyncFn());
  ```
- **[Custom Error](./src/utils/custom-error.ts)**: Typed error handling.
- **[Date](./src/utils/date-utils.ts)**, **[String](./src/utils/string-utils.ts)**, **[Array](./src/utils/array-utils.ts)**, **[Crypto](./src/utils/crypto-utils.ts)**, and more.

## 📣 Starter Kits

Looking for a full-stack starter?

- [Create T3 App](https://github.com/t3-oss/create-t3-app)
- [Next.js SaaS Starter](https://github.com/leerob/next-saas-starter)
