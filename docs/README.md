# Edge Kit Documentation

## Introduction

Edge Kit is a comprehensive toolkit for TypeScript projects, designed to accelerate development with high-quality, copy-paste-ready components. It's ideal for NextJS and other serverless platforms, prioritizing type safety and ease of use.

## Documentation Structure

- [Getting Started](./getting-started.md)
- [Core Concepts](./core-concepts.md)
- Services
  - [Storage](./services/storage.md)
  - [Key-Value](./services/key-value.md)
  - [Vector Database](./services/vector.md)
  - [Logging](./services/logging.md)
  - [Alerting](./services/alerting.md)
  - [Analytics](./services/analytics.md)
  - [Feature Flags](./services/feature-flags.md)
  - [Waitlist](./services/waitlist.md)
  - [Stripe Integration](./services/stripe.md)
  - [YouTube Integration](./services/youtube.md)
- [Composers](./composers.md)
- [Utilities](./utils.md)
- [LLM](./services/llm.md)

## Project Structure

```
edge-kit/
├── src/              # Source code
│   ├── composers/    # Composition utilities
│   ├── database/     # Database interfaces
│   ├── services/     # Core services
│   └── utils/        # Utility functions
└── docs/             # Documentation (you are here)
```

## Key Features

- **Modular Design**: Copy and use only what you need
- **AI-Editor-First**: Designed to work seamlessly with AI editors
- **Type Safety**: Strongly typed components for robust development
- **Serverless-Ready**: Optimized for NextJS and similar platforms

## Development Philosophy

Edge Kit is built with a "copy-paste-ready" philosophy. Instead of being a package you install, you can examine the implementations and copy exactly what you need into your project. This approach gives you:

1. Complete control over your dependencies
2. Ability to modify code to suit your specific needs
3. No version lock-in or breaking changes to worry about
4. Excellent learning opportunities about implementation details

## Next Steps

- Read [Getting Started](./getting-started.md) to set up your development environment
- Explore [Core Concepts](./core-concepts.md) to understand the design philosophy
- Browse the services documentation to find the components you need
