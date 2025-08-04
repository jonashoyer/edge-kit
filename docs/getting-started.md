# Getting Started with Edge Kit

## Overview

Edge Kit is a comprehensive toolkit for TypeScript projects, designed to provide high-quality, copy-paste-ready components. This guide will help you understand how to use Edge Kit in your projects.

## Prerequisites

- Node.js (v18 or higher recommended)
- TypeScript (v5.0 or higher recommended)
- A project using Next.js or similar serverless platform (optional, but recommended)

## Usage Philosophy

Edge Kit is built with a "copy-paste-first" philosophy:

1. Browse the components in the `src` directory
2. Copy the desired files into your project
3. Import and use the components as needed

This approach gives you:

- Complete control over your dependencies
- Ability to modify code to suit your specific needs
- No version lock-in or breaking changes to worry about

## Quick Start

### 1. Clone the Repository (Optional)

```bash
git clone https://github.com/jonashoyer/edge-kit.git
cd edge-kit
```

### 2. Explore the Components

Browse through the `src` directory to find the components you need:

- `src/services/` - Core service implementations (storage, key-value, analytics, etc.)
- `src/composers/` - Composition utilities
- `src/utils/` - Utility functions
- `src/database/` - Database interfaces

### 3. Copy Components to Your Project

Copy the files you need into your project's source directory. Be sure to maintain the same directory structure for related files.

### 4. Install Required Dependencies

Each component may require specific dependencies. Install them in your project:

```bash
npm install dependency-name
# or
yarn add dependency-name
# or
pnpm add dependency-name
```

The dependencies required for each component are listed at the top of their respective files.

### 5. Use the Components

Import and use the components in your code:

```typescript
import { S3Storage } from './services/storage/s3-storage';

const storage = new S3Storage({
  bucket: 'my-bucket',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: 'us-east-1',
});

// Use the storage service
await storage.upload('path/to/file', Buffer.from('Hello World'));
```

## Example: Setting Up a Key-Value Service

Here's a complete example of setting up a Redis key-value service:

```typescript
// Import the component
import { UpstashRedisKeyValueService } from './services/key-value/upstash-redis-key-value';

// Create an instance
const kv = new UpstashRedisKeyValueService(process.env.UPSTASH_REDIS_URL!, process.env.UPSTASH_REDIS_TOKEN!);

// Use the service
await kv.set('user:123', { name: 'Alice', email: 'alice@example.com' });
const user = await kv.get('user:123');
```

## Next Steps

- Explore [Core Concepts](./core-concepts.md) to understand the design philosophy
- Browse the services documentation to find specific components you need
- Check the [Utilities](./utils.md) documentation for helper functions
