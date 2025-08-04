# Composers

Composers are utilities that help compose and structure complex functionality in a type-safe manner. Edge Kit provides two main composers:

## NamespaceComposer

The `NamespaceComposer` helps manage key namespaces for key-value stores, cache systems, or any other system that requires structured key management.

### Location

`src/composers/namespace-composer.ts`

### Features

- Type-safe key generation
- Support for both static and dynamic keys
- Template literals with parameters

### Usage

```typescript
import { NamespaceComposer } from '../composers/namespace-composer';

// Create a namespace with static and dynamic keys
const namespace = new NamespaceComposer({
  // Static keys
  user: 'users',
  settings: 'settings',

  // Dynamic keys with parameters
  userSession: (userId: string) => `session:user:${userId}`,
  documentChunk: (documentId: string, chunkNumber: number) => `chunk:${documentId}:${chunkNumber}`,
  profile: (userId: string) => `profiles:${userId}`,

  // Complex parameters
  object: (params: { type: string; id: string }) => `objects:${params.type}:${params.id}`,
});

// Type-safe usage
const userKey = namespace.key('user'); // 'users'
const sessionKey = namespace.key('userSession', 'user123'); // 'session:user:user123'
const chunkKey = namespace.key('documentChunk', 'doc456', 1); // 'chunk:doc456:1'
const objectKey = namespace.key('object', { type: 'post', id: 'post789' }); // 'objects:post:post789'
```

### Use Cases

- Redis key management
- Cache key generation
- Web router path definitions
- Any system requiring structured, type-safe key generation

## PromptComposer

The `PromptComposer` helps build structured prompts for large language models (LLMs) with support for templates and dynamic content.

### Location

`src/composers/prompt-composer.ts`

### Features

- Template-based prompt generation
- Type-safe parameter substitution
- Component-based composition
- Utility methods for common transformations

### Usage

```typescript
import { PromptComposer } from '../composers/prompt-composer';

// Simple template with parameters
const simplePrompt = PromptComposer.build('Hello {{name}}! Today is {{date}}.', {
  name: 'Alice',
  date: new Date().toLocaleDateString(),
});

// Advanced composition with components
const advancedPrompt = PromptComposer.composer(
  `
  Hello {{name}}!

  Today is {{today}}
  
  Tasks:
  {{tasks}}

  Status:
  {{status}}

  User data:
  {{xml}}
  `,
  {
    // Components with custom converters
    today: {
      data: new Date(),
      converter: (date) => date.toLocaleDateString(),
    },
    tasks: {
      data: ['Buy groceries', 'Walk the dog', 'Finish report'],
      converter: PromptComposer.arrayToList,
    },
    status: {
      data: { ok: true, progress: '50%' },
      converter: PromptComposer.objectToKeyValue,
    },
    xml: {
      data: {
        name: 'John',
        age: 30,
        isStudent: false,
      },
      converter: (data) => PromptComposer.jsonToXml(data, 'user'),
    },
  },
  // Simple parameters
  {
    name: 'Alice',
  },
);
```

### Helper Methods

- `arrayToList`: Converts an array to a bulleted list
- `objectToKeyValue`: Converts an object to a key-value string
- `jsonToXml`: Converts a JSON object to XML
- `build`: Simple parameter substitution
- `composer`: Advanced composition with converters

### Use Cases

- Building structured prompts for LLMs
- Generating consistent documentation
- Creating templates for emails or notifications
- Any text generation requiring consistent formatting with dynamic content
