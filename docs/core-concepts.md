# Core Concepts

## Architecture Philosophy

Edge Kit is built around several key architectural principles that guide its design and implementation:

### 1. Abstract Base Classes

Most services in Edge Kit are designed with an abstract base class that defines the interface for that service type. This provides:

- Clear contracts for each service type
- Ability to swap implementations without changing consuming code
- Consistent interface across different providers
- Easy creation of mock implementations for testing

For example, storage services implement the `AbstractStorage` interface, key-value services implement the `AbstractKeyValueService` interface, and so on.

### 2. Provider-Specific Implementations

Each abstract service has one or more concrete implementations for specific providers. For example:

- `S3Storage` and `R2Storage` both implement `AbstractStorage`
- `UpstashRedisKeyValueService` and `IoredisKeyValueService` both implement `AbstractKeyValueService`

This allows you to choose the right provider for your needs while maintaining a consistent interface.

### 3. Type Safety

Edge Kit is built with TypeScript and prioritizes type safety through:

- Strongly typed interfaces
- Generic types for flexible but type-safe APIs
- Use of advanced TypeScript features like conditional types and mapped types
- Runtime type validation using libraries like Zod (where appropriate)

### 4. Composition Over Inheritance

While Edge Kit uses inheritance for defining service contracts, it encourages composition for building larger systems. The `composers` directory contains utilities for composing functionality:

- `NamespaceComposer`: For managing key namespaces
- `PromptComposer`: For building structured prompts for LLMs

## Service Design Patterns

### Dependency Injection

Edge Kit services often use dependency injection for greater flexibility and testability:

```typescript
// Service with dependencies injected
const alertingService = new AxiomAlertingService(
  process.env.AXIOM_TOKEN,
  'alerts-dataset',
  logger
);
```

### Singleton Pattern

Some services benefit from being singletons. A utility for creating singletons is provided:

```typescript
import { singleton } from '../utils/singleton';

export const getKVService = singleton(() => {
  return new UpstashRedisKeyValueService(
    process.env.UPSTASH_REDIS_URL!,
    process.env.UPSTASH_REDIS_TOKEN!
  );
});
```

### Factory Pattern

For services with complex initialization requirements, factory functions are often used:

```typescript
export function createStripeService(options) {
  const stripe = new Stripe(options.secretKey);
  const store = new MyStripeStore();
  
  return new StripeService(
    store,
    stripe,
    options
  );
}
```

## Service Categories

Edge Kit services fall into several broad categories:

### Infrastructure Services

These services provide abstractions over infrastructure components:
- Storage (S3, R2)
- Key-Value Stores (Redis)
- Vector Databases

### Business Services

These implement specific business functionality:
- Stripe Integration (payments, subscriptions)
- Waitlist Management
- Feature Flags

### Operational Services

These support operational aspects of your application:
- Logging
- Alerting
- Analytics

## Composition Utilities

Edge Kit provides composition utilities to help with common patterns:

### NamespaceComposer

Helps manage key namespaces for key-value stores and other systems that require key management:

```typescript
const namespace = new NamespaceComposer({
  user: 'users',
  userSession: (userId: string) => `session:user:${userId}`,
  document: (docId: string) => `document:${docId}`,
});

// Type-safe usage
const userKey = namespace.key('user');
const sessionKey = namespace.key('userSession', 'user123');
```

### PromptComposer

Helps build structured prompts for large language models:

```typescript
const prompt = PromptComposer.composer(
  `Hello {{name}}! Here are your tasks: {{tasks}}`,
  {
    tasks: {
      data: ["Task 1", "Task 2", "Task 3"],
      converter: PromptComposer.arrayToList,
    }
  },
  {
    name: "Alice"
  }
);
```

## Utilities

Edge Kit includes a rich set of utility functions for common tasks:

- Array manipulation
- Cryptography
- Date/time operations
- String manipulation
- Type helpers
- And more

These utilities are designed to be small, focused, and highly reusable.

## Next Steps

Now that you understand the core concepts of Edge Kit, you can:

- Learn about specific [services](./services/storage.md)
- Explore the [utilities](./utils.md)
- See how to use [composers](./composers.md) for more complex functionality
