# Edge Kit

Edge Kit is a comprehensive toolkit for TypeScript projects, designed to accelerate development with high-quality, copy-paste-ready components. Ideal for NextJS and other serverless platforms, Edge Kit prioritizes type safety and ease of use.

## 🚀 Features

- **Modular Design**: Copy and use only what you need
- **AI-Editor-First**: Designed to work seamlessly with AI editors
- **Type Safety**: Strongly typed components for robust development
- **Serverless-Ready**: Optimized for NextJS and similar platforms

### Billing

- [Stripe](./src/services/stripe/index.ts)

### Storage

- [S3](./src/services/storage/s3-storage.ts)
- [Cloudflare R2](./src/services/storage/r2-storage.ts)

### Key-Value Store

- [Upstash Redis](./src/services/key-value/upstash-redis-key-value.ts)
- [Ioredis](./src/services/key-value/ioredis-key-value.ts)

### Cache

- _Upstash Redis_

### Circuit Breaker

- _Upstash Redis_

### Vector Database

- [Upstash Vector](./src/services/vector/upstash-vector-database.ts)

### Logging

- [Axiom](./src/services/logging/axiom-logger.ts)
- [Pino](./src/services/logging/axiom-pino-logger.ts)

### Alerting

- [Axiom](./src/services/alerting/axiom-alerting.ts)
- [Slack](./src/services/alerting/slack-alerting.ts)
- [PagerDuty](./src/services/alerting/pager-duty-alerting.ts)

### Analytics

- [PostHog](./src/services/analytics/posthog-analytics.ts)

### LLM

- [Optimistic LLM warm-up](./src/services/llm/optimistic-llm.ts) – proactively warms provider token caches. See `./src/services/llm/README.md` for usage.

### Feature Flag

- [Client-side Feature Flag](./src/services/feature-flag/feature-flag.ts)

### Waitlist

- [Key-Value Waitlist](./src/services/waitlist/key-value-waitlist.ts): Efficient waitlist management using Redis sorted sets
- _Drizzle Waitlist_

## 🎼 Composers

- [Namespace Composer](./src/composers/namespace-composer.ts): Manage key-value pairs efficiently
- [Prompt Composer](./src/composers/prompt-composer.ts): Build prompts for LLMs with ease
- [Template Composer](./src/composers/template-composer.ts): Simple string templating with named variables

## 🧰 Utilities

Edge Kit includes a rich set of utility functions to streamline common tasks:

- [Array](./src/utils/array-utils.ts) - Array manipulation functions
- [Crypto](./src/utils/crypto-utils.ts) - Cryptography-related utilities
- [Date](./src/utils/date-utils.ts) - Date manipulation functions
- [Form](./src/utils/form-utils.ts) - Form-related helpers
- [Misc](./src/utils/misc-utils.ts) - Miscellaneous utility functions
- [Number](./src/utils/number-utils.ts) - Number manipulation functions
- [Random](./src/utils/random-utils.ts) - Random value generation utilities
- [String](./src/utils/string-utils.ts) - String manipulation functions
- [URL](./src/utils/url-utils.ts) - URL-related utilities
- [Type](./src/utils/type-utils.ts) - Common TypeScript type helpers

## 📚 Usage

1. Browse the components in the `src` directory
2. Copy the desired files into your project
3. Import and use the components as needed

## 📣 Looking for a full-stack starter kit?

Check out these popular options:

- [Create T3 App](https://github.com/t3-oss/create-t3-app)
- [Next.js SaaS Starter](https://github.com/leerob/next-saas-starter)
- [Create T3 Turbo](https://github.com/t3-oss/create-t3-turbo)
- [Better T Stack](https://better-t-stack.amanv.dev/new)
