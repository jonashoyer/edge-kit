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
| Markdown  | `markdown-utils.ts`  | Markdown schema builder           |

## String Utilities

Located in `src/utils/string-utils.ts`

- `ml`: Multi-line template literal helper
- `firstCharUpper`: Capitalize first character of a string
- `convertSnakeCaseToReadable`: Convert snake_case to Title Case
- `camelToSnakeCase`: Convert camelCase to snake_case
- `truncate`: Truncate a string to a maximum length

Example:

```typescript
import { camelToSnakeCase, firstCharUpper } from "../utils/string-utils";

firstCharUpper("hello"); // 'Hello'
camelToSnakeCase("helloWorld"); // 'hello_world'
```

## Array Utilities

Located in `src/utils/array-utils.ts`

Includes functions for array manipulation, chunking, and transformation.

Example:

```typescript
import { chunk } from "../utils/array-utils";

// Split array into chunks of size 2
chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
```

## Date Utilities

Located in `src/utils/date-utils.ts`

Functions for date manipulation, formatting, and comparison.

Example:

```typescript
import { formatDate, isDateBefore } from "../utils/date-utils";

formatDate(new Date(), "YYYY-MM-DD"); // '2025-05-18'
isDateBefore(new Date("2023-01-01"), new Date("2023-02-01")); // true
```

## Crypto Utilities

Located in `src/utils/crypto-utils.ts`

Cryptography functions for hashing, encryption, and secure random values.

Example:

```typescript
import { encrypt, generateHash } from "../utils/crypto-utils";

// Generate SHA-256 hash
const hash = await generateHash("password");

// Encrypt data
const encrypted = await encrypt("secret data", "encryption-key");
```

## Random Utilities

Located in `src/utils/random-utils.ts`

Functions for generating random values with deterministic seeding options.

Example:

```typescript
import {
  generateRandomString,
  seedRandomNumberGenerator,
} from "../utils/random-utils";

// Generate seeded random number
const generator = seedRandomNumberGenerator("my-seed");
const randomValue = generator(); // Deterministic based on seed

// Generate random string
const randomString = generateRandomString(10); // 10 characters
```

## Type Utilities

Located in `src/utils/type-utils.ts`

TypeScript type helpers and utility types.

Example:

```typescript
import { DeepPartial, Nullable } from "../utils/type-utils";

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
import { sleep } from "../utils/promise-utils";

async function main() {
  console.log("Start");
  await sleep(1000); // Wait for 1 second
  console.log("End");
}
```

## Singleton Utility

Located in `src/utils/singleton.ts`

A utility for implementing the singleton pattern.

Example:

```typescript
import { UpstashRedisKeyValueService } from "../services/key-value/upstash-redis-key-value";
import { singleton } from "../utils/singleton";

// Create a singleton instance
export const getKVService = singleton(() => {
  return new UpstashRedisKeyValueService(
    process.env.UPSTASH_REDIS_URL!,
    process.env.UPSTASH_REDIS_TOKEN!
  );
});

// Usage
const kv = getKVService();
```

## Error Handling

Located in `src/utils/try-catch-utils.ts` and `src/utils/custom-error.ts`

Utilities for error handling and custom error types.

Example:

```typescript
import { CustomError } from "../utils/custom-error";
import { tryCatch } from "../utils/try-catch-utils";

// Try-catch wrapper
const [error, result] = await tryCatch(async () => {
  return await someAsyncFunction();
});

if (error) {
  console.error("Operation failed:", error);
} else {
  console.log("Result:", result);
}

// Custom error
class ValidationError extends CustomError {
  constructor(message: string) {
    super("ValidationError", message);
  }
}
```

## Form Utilities

Located in `src/utils/form-utils.ts`

Helpers for form handling and validation.

Example:

```typescript
import { validateEmail } from "../utils/form-utils";

validateEmail("user@example.com"); // true
validateEmail("invalid-email"); // false
```

## Markdown Schema Builder

Located in `src/utils/markdown-utils.ts`

A powerful utility for rendering structured data as markdown or XML with configurable schemas. Perfect for creating AI prompts, documentation, or structured text output.

### Core Concepts

- **Schema-based rendering**: Define how your data should be formatted once, reuse everywhere
- **Type-safe**: Full TypeScript support with type inference
- **Flexible formatting**: Support for markdown, XML, nested objects, and arrays
- **Configurable labels**: Format labels as bold, italic, code, or plain text
- **Transform functions**: Pre-process values before rendering
- **Smart array handling**: Automatic inline/bulleted rendering based on size and content

### Basic Usage

```typescript
import { mdSchema } from "../utils/markdown-utils";

type User = {
  name: string;
  email: string;
  age: number;
};

const userSchema = mdSchema<User>({
  name: { format: "bold" },
  email: { format: "code" },
  age: { label: "Age (years)" },
});

const markdown = userSchema.build({
  name: "Alice",
  email: "alice@example.com",
  age: 30,
});

// Output:
// **name**: Alice
// `email`: alice@example.com
// Age (years): 30
```

### Label Formatting

Control how field labels appear in the output:

```typescript
const schema = mdSchema<Product>({
  id: { format: "code" }, // `id`: value
  name: { format: "bold" }, // **name**: value
  status: { format: "italic" }, // *status*: value
  description: { format: "plain" }, // description: value (default)
});
```

### Array Rendering

Arrays can be rendered inline or as bulleted lists, with automatic threshold-based switching:

```typescript
const schema = mdSchema<Post>({
  // Inline for small arrays (≤3 items by default)
  tags: { arrayMode: "inline" },
  // Result: tags: typescript, react, node

  // Always bulleted
  items: { arrayMode: "bulleted" },
  // Result:
  // items: - item1
  // - item2
  // - item3

  // Custom threshold
  keywords: { inlineThreshold: 5 },
  // Inline if ≤5 items, bulleted if >5
});
```

### Nested Objects

Render complex nested data structures with full schema support:

```typescript
type Organization = {
  name: string;
  address: {
    street: string;
    city: string;
    country: string;
  };
};

const orgSchema = mdSchema<Organization>({
  name: { format: "bold" },
  address: {
    label: "Location",
    fields: {
      street: {},
      city: {},
      country: { format: "bold" },
    },
  },
});

const result = orgSchema.build({
  name: "Acme Corp",
  address: {
    street: "123 Main St",
    city: "NYC",
    country: "USA",
  },
});

// Output:
// **name**: Acme Corp
// Location:
//   street: 123 Main St
//   city: NYC
//   **country**: USA
```

### Arrays of Objects

Render arrays containing nested objects:

```typescript
type Team = {
  name: string;
  members: Array<{
    name: string;
    role: string;
  }>;
};

const teamSchema = mdSchema<Team>({
  name: { format: "bold" },
  members: {
    arrayMode: "bulleted",
    fields: {
      name: {},
      role: { format: "italic" },
    },
  },
});

const result = teamSchema.build({
  name: "Engineering",
  members: [
    { name: "Alice", role: "Lead" },
    { name: "Bob", role: "Developer" },
  ],
});

// Output:
// **name**: Engineering
// members: - name: Alice
//   *role*: Lead
// - name: Bob
//   *role*: Developer
```

### Transform Functions

Pre-process values before rendering:

```typescript
const schema = mdSchema<Event>({
  name: {},
  date: {
    label: "Scheduled",
    transform: (date: Date) => date.toISOString().split("T")[0],
  },
  price: {
    label: "Price (USD)",
    transform: (n: number) => `$${n.toFixed(2)}`,
  },
});

const result = schema.build({
  name: "Conference",
  date: new Date("2025-10-01"),
  price: 149.99,
});

// Output:
// name: Conference
// Scheduled: 2025-10-01
// Price (USD): $149.99
```

### Omitting Empty Fields

Skip fields that are empty, null, or undefined:

```typescript
const schema = mdSchema<UserProfile>({
  username: {},
  bio: { omitIfEmpty: true },
  website: { omitIfEmpty: true },
  tags: { omitIfEmpty: true },
});

const result = schema.build({
  username: "alice",
  bio: "", // Omitted
  website: null, // Omitted
  tags: [], // Omitted
});

// Output:
// username: alice
```

### XML Rendering

Convert structured data to XML format:

```typescript
const schema = mdSchema<Config>({
  apiKey: {},
  timeout: {},
  retries: { omitIfEmpty: true },
});

const xml = schema.buildXml(
  {
    apiKey: "secret123",
    timeout: 5000,
  },
  "configuration" // Custom root element name
);

// Output:
// <configuration>
//   <apiKey>secret123</apiKey>
//   <timeout>5000</timeout>
// </configuration>
```

### Standalone Functions

Use without creating a schema object:

```typescript
import { buildMarkdown, buildXml } from "../utils/markdown-utils";

const markdown = buildMarkdown(data, config);
const xml = buildXml(data, config, "root");
```

### Integration with Prompt Templates

Combine with the `tpl` utility for AI prompts:

```typescript
import { tpl } from "../utils/tpl/tpl";
import { mdSchema } from "../utils/markdown-utils";

const userSchema = mdSchema<User>({
  name: { format: "bold" },
  role: {},
  permissions: { arrayMode: "bulleted" },
});

const prompt = tpl`
  You are helping a user with the following profile:
  
  ${userSchema.build(currentUser)}
  
  Please assist them with their request.
`;
```

### Advanced Example: Complete Product Schema

```typescript
type Product = {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
  tags: string[];
  specs: {
    weight: number;
    dimensions: string;
  };
  reviews: Array<{
    author: string;
    rating: number;
    comment: string;
  }>;
};

const productSchema = mdSchema<Product>({
  id: {
    format: "code",
    label: "Product ID",
  },
  name: {
    format: "bold",
  },
  price: {
    label: "Price (USD)",
    transform: (n: number) => `$${n.toFixed(2)}`,
  },
  inStock: {
    label: "Availability",
    transform: (stock: boolean) => (stock ? "In Stock" : "Out of Stock"),
  },
  tags: {
    arrayMode: "inline",
    inlineThreshold: 5,
  },
  specs: {
    label: "Specifications",
    fields: {
      weight: {
        label: "Weight (kg)",
      },
      dimensions: {},
    },
  },
  reviews: {
    label: "Customer Reviews",
    arrayMode: "bulleted",
    omitIfEmpty: true,
    fields: {
      author: { format: "bold" },
      rating: {
        transform: (n: number) => `${"⭐".repeat(n)} (${n}/5)`,
      },
      comment: {},
    },
  },
});

const output = productSchema.build({
  id: "prod-12345",
  name: "Premium Widget",
  price: 99.99,
  inStock: true,
  tags: ["featured", "bestseller", "new"],
  specs: {
    weight: 1.5,
    dimensions: "10x5x3 cm",
  },
  reviews: [
    {
      author: "John",
      rating: 5,
      comment: "Excellent product!",
    },
  ],
});
```

### API Reference

#### Types

- `FieldFormat`: `'bold' | 'italic' | 'code' | 'plain'`
- `OutputFormat`: `'markdown' | 'xml'`
- `ArrayRenderMode`: `'inline' | 'bulleted'`
- `FieldConfig<T>`: Configuration object for a field
  - `label?: string` - Custom display label
  - `format?: FieldFormat` - Label formatting style
  - `outputFormat?: OutputFormat` - Override schema output format
  - `transform?: (value: T) => unknown` - Value transformation function
  - `arrayMode?: ArrayRenderMode` - Array rendering mode
  - `inlineThreshold?: number` - Max items for inline arrays (default: 3)
  - `omitIfEmpty?: boolean` - Skip if value is falsy
  - `fields?: MdSchemaConfig<T>` - Nested object schema
- `MdSchemaConfig<T>`: Map of field names to configs
- `MdSchema<T>`: Schema object with build methods

#### Functions

- `mdSchema<T>(config)`: Create a schema instance
- `buildMarkdown<T>(data, config)`: Build markdown string (standalone)
- `buildXml<T>(data, config, rootName?)`: Build XML string (standalone)

## Best Practices

1. **Import only what you need**: Most utility functions are exported individually, so import only the functions you need.

2. **Combine with TypeScript**: The utility functions work best with TypeScript to provide type safety.

3. **Extend as needed**: Feel free to extend or modify the utility functions to suit your specific needs.

4. **Check for updates**: As Edge Kit evolves, new utility functions may be added. Check the source code for the latest utilities.
