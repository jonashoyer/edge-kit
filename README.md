# Edge Kit

Edge Kit is a comprehensive toolkit for TypeScript projects, designed to accelerate development with high-quality, copy-paste-ready components. Ideal for NextJS and other serverless platforms, Edge Kit prioritizes type safety, minimal dependencies, and architectural best practices.

## 🚀 Core Philosophy

Edge Kit is built with a **"copy-paste-first"** philosophy. Instead of installing a monolithic package, you copy exactly what you need into your project.

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

### Key-Value Store

- [Upstash Redis](./src/services/key-value/upstash-redis-key-value.ts)
- [Ioredis](./src/services/key-value/ioredis-key-value.ts)

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

### Feature Flags & Waitlist

- [Client-side Feature Flag](./src/services/feature-flag/feature-flag.ts)
- [Key-Value Waitlist](./src/services/waitlist/key-value-waitlist.ts)

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

Build structured LLM prompts with template substitution.

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
