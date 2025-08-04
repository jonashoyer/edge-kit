# Key-Value Services

Edge Kit provides abstract and concrete implementations for key-value storage services, allowing you to store and retrieve data using simple key-value patterns.

## Overview

The key-value services allow you to:

- Store and retrieve data by key
- Check if a key exists
- Delete keys
- Set expiration (TTL) on keys
- Work with sorted sets (for ranking, leaderboards, etc.)
- Perform atomic operations like increment/decrement

## Abstract Key-Value Service

The `AbstractKeyValueService` class defines the interface that all key-value implementations must follow:

```typescript
export abstract class AbstractKeyValueService {
  abstract get<T>(key: string): Promise<Nullable<T>>;
  abstract mget<T>(keys: string[]): Promise<Nullable<T>[]>;
  abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract increment(key: string, amount?: number): Promise<number>;
  abstract decrement(key: string, amount?: number): Promise<number>;
  abstract expire(key: string, ttlSeconds: number): Promise<boolean>;

  // Sorted set operations
  abstract zadd(key: string, score: number, member: string): Promise<void>;
  abstract zrank(key: string, member: string): Promise<number | null>;
  abstract zcard(key: string): Promise<number>;
  abstract zrange(key: string, start: number, stop: number): Promise<string[]>;
  abstract zrem(key: string, member: string | string[]): Promise<void>;
  abstract mdelete(keys: string[]): Promise<void>;

  // Helper methods
  async withCache<T>(key: string, callback: () => Promise<T>): Promise<T>;
}
```

## Available Implementations

Edge Kit provides the following key-value implementations:

### UpstashRedisKeyValueService

A key-value implementation using Upstash Redis, optimized for serverless environments.

**Location**: `src/services/key-value/upstash-redis-key-value.ts`

**Dependencies**:

- `@upstash/redis`

**Usage**:

```typescript
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';

const kv = new UpstashRedisKeyValueService(process.env.UPSTASH_REDIS_URL!, process.env.UPSTASH_REDIS_TOKEN!);

// Store a value
await kv.set('user:123', { name: 'Alice', email: 'alice@example.com' });

// Retrieve a value
const user = await kv.get<{ name: string; email: string }>('user:123');

// Check if a key exists
const exists = await kv.exists('user:123');

// Delete a key
await kv.delete('user:123');
```

### IoredisKeyValueService

A key-value implementation using ioredis, ideal for server environments.

**Location**: `src/services/key-value/ioredis-key-value.ts`

**Dependencies**:

- `ioredis`

**Usage**:

```typescript
import { IoredisKeyValueService } from '../services/key-value/ioredis-key-value';

const kv = new IoredisKeyValueService({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

// Usage is identical to UpstashRedisKeyValueService
await kv.set('user:123', { name: 'Alice', email: 'alice@example.com' });
```

## Common Operations

### Basic Key-Value Operations

```typescript
// Store a value (no expiration)
await kv.set('key', 'value');

// Store a value with 1 hour expiration
await kv.set('key', 'value', 3600);

// Retrieve a value
const value = await kv.get<string>('key');

// Check if a key exists
const exists = await kv.exists('key');

// Delete a key
await kv.delete('key');

// Set expiration on an existing key
await kv.expire('key', 3600); // 1 hour TTL
```

### Working with Complex Data Types

Key-value services automatically handle serialization and deserialization of complex types:

```typescript
// Store an object
await kv.set('user:123', {
  id: 123,
  name: 'Alice',
  email: 'alice@example.com',
  roles: ['admin', 'user'],
  metadata: {
    lastLogin: new Date(),
    preferences: { theme: 'dark' },
  },
});

// Retrieve the object with its type
const user = await kv.get<{
  id: number;
  name: string;
  email: string;
  roles: string[];
  metadata: {
    lastLogin: string;
    preferences: { theme: string };
  };
}>('user:123');

// Access properties
console.log(user?.name); // 'Alice'
console.log(user?.metadata.preferences.theme); // 'dark'
```

### Batch Operations

For better performance, use batch operations when possible:

```typescript
// Get multiple keys at once
const [user1, user2] = await kv.mget(['user:1', 'user:2']);

// Delete multiple keys
await kv.mdelete(['key1', 'key2', 'key3']);
```

### Counter Operations

Increment and decrement operations are atomic:

```typescript
// Initialize a counter
await kv.set('visits', 0);

// Increment by 1
const newValue1 = await kv.increment('visits'); // 1

// Increment by specific amount
const newValue2 = await kv.increment('visits', 5); // 6

// Decrement
const newValue3 = await kv.decrement('visits'); // 5
```

### Caching Pattern

The `withCache` method provides a simple caching pattern:

```typescript
const data = await kv.withCache('expensive-operation', async () => {
  // This function will only be called if the key doesn't exist
  console.log('Cache miss, performing expensive operation');
  return await expensiveOperation();
});
```

### Working with Sorted Sets

Sorted sets are perfect for leaderboards, rankings, and time-ordered data:

```typescript
// Add items to a sorted set
await kv.zadd('leaderboard', 100, 'user:1');
await kv.zadd('leaderboard', 200, 'user:2');
await kv.zadd('leaderboard', 150, 'user:3');

// Get a user's rank (0-based index)
const rank = await kv.zrank('leaderboard', 'user:2'); // 2 (highest score)

// Count items in a sorted set
const count = await kv.zcard('leaderboard'); // 3

// Get items in a sorted set by rank range (lowest to highest)
const top3 = await kv.zrange('leaderboard', 0, 2);
// ['user:1', 'user:3', 'user:2'] (ordered by score, ascending)

// Remove items from a sorted set
await kv.zrem('leaderboard', 'user:1');
```

## Integration with NamespaceComposer

Key-value services work seamlessly with the `NamespaceComposer` for better key organization:

```typescript
import { NamespaceComposer } from '../../composers/namespace-composer';
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';

// Create a namespace for keys
const namespace = new NamespaceComposer({
  user: (userId: string) => `user:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  counter: (name: string) => `counter:${name}`,
});

// Create KV service
const kv = new UpstashRedisKeyValueService(process.env.UPSTASH_REDIS_URL!, process.env.UPSTASH_REDIS_TOKEN!);

// Use with namespaced keys
await kv.set(namespace.key('user', '123'), { name: 'Alice' });
await kv.increment(namespace.key('counter', 'visits'));
const session = await kv.get(namespace.key('session', 'abc-123'));
```

## Best Practices

1. **Key Structure**: Use a consistent key naming convention:

```typescript
// Example conventions
const userKey = `user:${userId}`;
const sessionKey = `session:${sessionId}`;
const counterKey = `counter:${name}`;
```

2. **Type Safety**: Use TypeScript generics for type safety:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

const user = await kv.get<User>('user:123');
// user is typed as Nullable<User>
```

3. **TTL Management**: Use TTL for ephemeral data:

```typescript
// Session with 24-hour TTL
await kv.set(`session:${sessionId}`, sessionData, 86400);

// Password reset token with 1-hour TTL
await kv.set(`reset:${token}`, userId, 3600);
```

4. **Error Handling**: Always handle potential errors:

```typescript
try {
  const user = await kv.get<User>('user:123');
  // Use user...
} catch (error) {
  console.error('Failed to get user:', error);
  // Handle error...
}
```

## Custom Implementations

You can create your own key-value implementation by extending the `AbstractKeyValueService` class:

```typescript
import { AbstractKeyValueService } from '../services/key-value/abstract-key-value';
import { Nullable } from '../utils/type-utils';

export class MyKeyValueService extends AbstractKeyValueService {
  // Implement all abstract methods...

  async get<T>(key: string): Promise<Nullable<T>> {
    // Implementation
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    // Implementation
  }

  // And so on...
}
```
