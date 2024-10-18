# Q Kit

Q Kit is a comprehensive toolkit for TypeScript projects, designed to accelerate development with high-quality, copy-paste-ready components. Ideal for NextJS and other serverless platforms, Q Kit prioritizes type safety and ease of use.

## 🚀 Features

- **Modular Design**: Copy and use only what you need
- **Type Safety**: Strongly typed components for robust development
- **Serverless-Ready**: Optimized for NextJS and similar platforms

## 🛠 Services

### Storage

- [S3](./src/services/storage/s3Storage.ts)
- [Cloudflare R2](./src/services/storage/r2Storage.ts)

### Key-Value Store

- [Upstash Redis](./src/services/keyValue/upstashRedisKeyValueService.ts)
- [Ioredis](./src/services/keyValue/ioredisKeyValueService.ts)

### Vector Database

- Upstash Vector

### Job Queue

- Inngest

### Logging

- [Axiom](./src/services/logging/axiomLogger.ts)
- [Pino](./src/services/logging/axiomPinoLogger.ts)

### Alerting

- [Axiom](./src/services/alerting/axiomAlertingService.ts)
- [Slack](./src/services/alerting/slackAlertingService.ts)
- [PagerDuty](./src/services/alerting/pagerDutyAlertingService.ts)

### Analytics

- PostHog

## 🎼 Composers

- [Namespace Composer](./src/composers/namespaceComposer.ts): Manage key-value pairs efficiently
- [Prompt Composer](./src/composers/promptComposer.ts): Build prompts for LLMs with ease

## 🧰 Utilities

Q Kit includes a rich set of utility functions to streamline common tasks:

| Utility                                      | Description                       |
| -------------------------------------------- | --------------------------------- |
| [arrayUtils.ts](./src/utils/arrayUtils.ts)   | Array manipulation functions      |
| [cryptoUtils.ts](./src/utils/cryptoUtils.ts) | Cryptography-related utilities    |
| [dateUtils.ts](./src/utils/dateUtils.ts)     | Date manipulation functions       |
| [formUtils.ts](./src/utils/formUtils.ts)     | Form-related helpers              |
| [miscUtils.ts](./src/utils/miscUtils.ts)     | Miscellaneous utility functions   |
| [numberUtils.ts](./src/utils/numberUtils.ts) | Number manipulation functions     |
| [randomUtils.ts](./src/utils/randomUtils.ts) | Random value generation utilities |
| [stringUtils.ts](./src/utils/stringUtils.ts) | String manipulation functions     |
| [urlUtils.ts](./src/utils/urlUtils.ts)       | URL-related utilities             |
| [typeUtils.ts](./src/utils/typeUtils.ts)     | Common TypeScript type helpers    |

## 📚 Usage

1. Browse the components in the `src` directory
2. Copy the desired files into your project
3. Import and use the components as needed

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📣 Looking for a full-stack starter kit?

Check out these popular options:

- [Create T3 App](https://github.com/t3-oss/create-t3-app)
- [Next.js SaaS Starter](https://github.com/leerob/next-saas-starter)
- [Create T3 Turbo](https://github.com/t3-oss/create-t3-turbo)

## 📄 License

[MIT](LICENSE)
