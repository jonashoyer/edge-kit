# Edge Kit

Edge Kit is a carefully designed TypeScript toolkit for modern serverless applications, with a special emphasis on NextJS and similar platforms. It includes a set of high-quality, type-safe components that can be copied and reused as desired.

## 🚀 Features

- **Modular Design**: Copy and use only what you need
- **AI-Editor-First**: Designed to work seamlessly with AI editors
- **Type Safety**: Strongly typed components for robust development
- **Serverless-Ready**: Optimized for NextJS and similar platforms

## 🛠 Services

### Storage

- [S3](./src/services/storage/s3Storage.ts)
- [Cloudflare R2](./src/services/storage/r2Storage.ts)

### Key-Value Store

- [Upstash Redis](./src/services/keyValue/upstashRedisKeyValue.ts)
- [Ioredis](./src/services/keyValue/ioredisKeyValue.ts)

### Vector Database

- _Upstash Vector_

### Logging

- [Axiom](./src/services/logging/axiomLogger.ts)
- [Pino](./src/services/logging/axiomPinoLogger.ts)

### Alerting

- [Axiom](./src/services/alerting/axiomAlerting.ts)
- [Slack](./src/services/alerting/slackAlerting.ts)
- [PagerDuty](./src/services/alerting/pagerDutyAlerting.ts)

### Analytics

- [PostHog](./src/services/analytics/posthogAnalytics.ts)

### Feature Flag

- [Client-side Feature Flag](./src/services/featureFlag/clientFeatureFlag.ts)

### Waitlist

- [Key-Value Waitlist](./src/services/waitlist/keyValueWaitlist.ts): Efficient waitlist management using Redis sorted sets
- _Drizzle Waitlist_

## 🎼 Composers

- [Namespace Composer](./src/composers/namespaceComposer.ts): Manage key-value pairs efficiently
- [Prompt Composer](./src/composers/promptComposer.ts): Build prompts for LLMs with ease

## 🧰 Utilities

Q Kit includes a rich set of utility functions to streamline common tasks:

- [Array](./src/utils/arrayUtils.ts) - Array manipulation functions
- [Crypto](./src/utils/cryptoUtils.ts) - Cryptography-related utilities
- [Date](./src/utils/dateUtils.ts) - Date manipulation functions
- [Form](./src/utils/formUtils.ts) - Form-related helpers
- [Misc](./src/utils/miscUtils.ts) - Miscellaneous utility functions
- [Number](./src/utils/numberUtils.ts) - Number manipulation functions
- [Random](./src/utils/randomUtils.ts) - Random value generation utilities
- [String](./src/utils/stringUtils.ts) - String manipulation functions
- [URL](./src/utils/urlUtils.ts) - URL-related utilities
- [Type](./src/utils/typeUtils.ts) - Common TypeScript type helpers

## 📚 Usage

1. Browse the components in the `src` directory
2. Copy the desired files into your project
3. Import and use the components as needed

## 📣 Looking for a full-stack starter kit?

Check out these popular options:

- [Create T3 App](https://github.com/t3-oss/create-t3-app)
- [Next.js SaaS Starter](https://github.com/leerob/next-saas-starter)
- [Create T3 Turbo](https://github.com/t3-oss/create-t3-turbo)
