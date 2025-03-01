# Edge Kit

Edge Kit is a comprehensive toolkit for TypeScript projects, designed to accelerate development with high-quality, copy-paste-ready components. Ideal for NextJS and other serverless platforms, Edge Kit prioritizes type safety and ease of use.

## 🚀 Features

- **Modular Design**: Copy and use only what you need
- **AI-Editor-First**: Designed to work seamlessly with AI editors
- **Type Safety**: Strongly typed components for robust development
- **Serverless-Ready**: Optimized for NextJS and similar platforms

## Infrastructure

- [Drizzle](./src/database/drizzleSchema.ts)
- [SQLite](./src/database/sqliteDatabase.ts)

### Role Structures

1. **Single User**

- Ideal for single-admin applications
- Simple authentication without complex role management

2. **Multi-User with Basic Roles**

- Supports multiple users with predefined roles (e.g., Admin, User)
- Suitable for small to medium-sized applications

### Authentication

- [NextAuth](./src/auth/nextAuth.ts)

### Authorization

### Billing

- [Stripe](./src/services/billing/stripeBillingManager.ts)

1. **Flat-rate**
2. **Seat-based**
3. **Usage-based**

- Trial period support

## 🛠 Services

### Storage

- [S3](./src/services/storage/s3Storage.ts)
- [Cloudflare R2](./src/services/storage/r2Storage.ts)

### Key-Value Store

- [Upstash Redis](./src/services/keyValue/upstashRedisKeyValue.ts)
- [Ioredis](./src/services/keyValue/ioredisKeyValue.ts)

### Cache

- _Upstash Redis_

### Circuit Breaker

- _Upstash Redis_

### Vector Database

- [Upstash Vector](./src/services/vectorDatabase/upstashVectorDatabase.ts)

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
