# Utilities

Edge Kit includes a rich set of utility functions for common tasks. These utilities are designed to be small, focused, and highly reusable.

## Overview

The utilities are organized by category in the `src/utils/` directory:

| Category  | File                 | Description                       |
| --------- | -------------------- | --------------------------------- |
| Array     | `array-utils.ts`     | Array manipulation functions      |
| Crypto    | `crypto-utils.ts`    | Cryptography-related utilities    |
| Date      | `date-utils.ts`      | Date and time manipulation        |
| Form      | `form-utils.ts`      | Form-related helpers              |
| String    | `string-utils.ts`    | String manipulation functions     |
| Number    | `number-utils.ts`    | Number manipulation functions     |
| Random    | `random-utils.ts`    | Random value generation           |
| Object    | `object-utils.ts`    | Object manipulation utilities     |
| Promise   | `promise-utils.ts`   | Promise-related utilities         |
| Type      | `type-utils.ts`      | TypeScript type helpers           |
| Misc      | `misc-utils.ts`      | Miscellaneous utility functions   |
| URL       | `url-utils.ts`       | URL-related utilities             |
| Error     | `custom-error.ts`    | Custom error types                |
| Singleton | `singleton.ts`       | Singleton pattern implementation  |
| Signature | `signature-utils.ts` | Cryptographic signature utilities |
| Try/Catch | `try-catch-utils.ts` | Error handling utilities          |
| ID        | `id-generator.ts`    | ID generation utilities           |

## String Utilities

Located in `src/utils/string-utils.ts`

- `ml`: Multi-line template literal helper
- `firstCharUpper`: Capitalize first character of a string
- `convertSnakeCaseToReadable`: Convert snake_case to Title Case
- `camelToSnakeCase`: Convert camelCase to snake_case
- `truncate`: Truncate a string to a maximum length

Example:

```typescript
import { camelToSnakeCase, firstCharUpper } from '../utils/string-utils';

firstCharUpper('hello'); // 'Hello'
camelToSnakeCase('helloWorld'); // 'hello_world'
```

## Array Utilities

Located in `src/utils/array-utils.ts`

Includes functions for array manipulation, chunking, and transformation.

Example:

```typescript
import { chunk } from '../utils/array-utils';

// Split array into chunks of size 2
chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
```

## Date Utilities

Located in `src/utils/date-utils.ts`

Functions for date manipulation, formatting, and comparison.

Example:

```typescript
import { formatDate, isDateBefore } from '../utils/date-utils';

formatDate(new Date(), 'YYYY-MM-DD'); // '2025-05-18'
isDateBefore(new Date('2023-01-01'), new Date('2023-02-01')); // true
```

## Crypto Utilities

Located in `src/utils/crypto-utils.ts`

Cryptography functions for hashing, encryption, and secure random values.

Example:

```typescript
import { encrypt, generateHash } from '../utils/crypto-utils';

// Generate SHA-256 hash
const hash = await generateHash('password');

// Encrypt data
const encrypted = await encrypt('secret data', 'encryption-key');
```

## Random Utilities

Located in `src/utils/random-utils.ts`

Functions for generating random values with deterministic seeding options.

Example:

```typescript
import { generateRandomString, seedRandomNumberGenerator } from '../utils/random-utils';

// Generate seeded random number
const generator = seedRandomNumberGenerator('my-seed');
const randomValue = generator(); // Deterministic based on seed

// Generate random string
const randomString = generateRandomString(10); // 10 characters
```

## Type Utilities

Located in `src/utils/type-utils.ts`

TypeScript type helpers and utility types.

Example:

```typescript
import { DeepPartial, Nullable } from '../utils/type-utils';

// Nullable type
const value: Nullable<string> = null; // Can be string or null

// Deep partial
type User = { name: string; profile: { age: number } };
const partialUser: DeepPartial<User> = { profile: {} }; // Valid
```

## Promise Utilities

Located in `src/utils/promise-utils.ts`

Utilities for working with Promises and asynchronous operations.

Example:

```typescript
import { sleep } from '../utils/promise-utils';

async function main() {
  console.log('Start');
  await sleep(1000); // Wait for 1 second
  console.log('End');
}
```

## Singleton Utility

Located in `src/utils/singleton.ts`

A utility for implementing the singleton pattern.

Example:

```typescript
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';
import { singleton } from '../utils/singleton';

// Create a singleton instance
export const getKVService = singleton(() => {
  return new UpstashRedisKeyValueService(process.env.UPSTASH_REDIS_URL!, process.env.UPSTASH_REDIS_TOKEN!);
});

// Usage
const kv = getKVService();
```

## Error Handling

Located in `src/utils/try-catch-utils.ts` and `src/utils/custom-error.ts`

Utilities for error handling and custom error types.

Example:

```typescript
import { CustomError } from '../utils/custom-error';
import { tryCatch } from '../utils/try-catch-utils';

// Try-catch wrapper
const [error, result] = await tryCatch(async () => {
  return await someAsyncFunction();
});

if (error) {
  console.error('Operation failed:', error);
} else {
  console.log('Result:', result);
}

// Custom error
class ValidationError extends CustomError {
  constructor(message: string) {
    super('ValidationError', message);
  }
}
```

## Form Utilities

Located in `src/utils/form-utils.ts`

Helpers for form handling and validation.

Example:

```typescript
import { validateEmail } from '../utils/form-utils';

validateEmail('user@example.com'); // true
validateEmail('invalid-email'); // false
```

## Best Practices

1. **Import only what you need**: Most utility functions are exported individually, so import only the functions you need.

2. **Combine with TypeScript**: The utility functions work best with TypeScript to provide type safety.

3. **Extend as needed**: Feel free to extend or modify the utility functions to suit your specific needs.

4. **Check for updates**: As Edge Kit evolves, new utility functions may be added. Check the source code for the latest utilities.
