# Storage Services

Edge Kit provides abstract and concrete implementations for object storage
services, allowing you to store and retrieve files across S3-compatible
providers and the local filesystem.

## Overview

The storage services allow you to:

- Write files to object storage
- Read files from object storage
- Check whether an object exists
- Delete one or many objects
- List objects or list paginated object pages
- Generate read and write pre-signed URLs
- Read object metadata

## Abstract Storage Service

The `AbstractStorage` class defines the interface that all storage implementations must follow:

```typescript
type StorageBody = string | Uint8Array | ArrayBuffer | Blob;

type StorageWriteOptions = {
  contentType?: string;
  metadata?: Record<string, unknown>;
};

type StorageWritePresignedUrlOptions = {
  contentType: string;
  maxBytes?: number;
  minBytes?: number;
  bytesLimit?: number; // compatibility alias
};

abstract class AbstractStorage {
  abstract write(
    key: string,
    data: StorageBody,
    opts?: StorageWriteOptions
  ): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract deleteMany(keys: string[]): Promise<void>;
  abstract list(prefix?: string): Promise<string[]>;
  abstract listPage(
    prefix?: string,
    options?: { maxKeys?: number; continuationToken?: string }
  ): Promise<{ keys: string[]; continuationToken?: string }>;
  abstract createReadPresignedUrl(
    key: string
  ): Promise<{ url: string; expiresAt: number }>;
  abstract createWritePresignedUrl(
    key: string,
    opts: StorageWritePresignedUrlOptions
  ): Promise<{
    url: string;
    fields?: Record<string, string>;
    method: 'POST' | 'PUT';
    expiresAt: number;
  }>;
  abstract objectMetadata<TMeta = never>(
    key: string
  ): Promise<{
    contentLength: number;
    contentType?: string;
    etag?: string;
    lastModified?: number;
    meta: TMeta;
  }>;
}
```

## Available Implementations

Edge Kit provides the following storage implementations:

### S3Storage

A storage implementation for AWS S3.

**Location**: `src/services/storage/s3-storage.ts`

**Dependencies**:

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

**Usage**:

```typescript
import { S3Storage } from '../services/storage/s3-storage';

const storage = new S3Storage({
  bucket: 'my-bucket',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: 'us-east-1',
});

// Write a file
await storage.write('path/to/file.txt', Buffer.from('Hello World'));

// Read a file
const data = await storage.read('path/to/file.txt');

// Delete a file
await storage.delete('path/to/file.txt');

// Check whether a file exists
const exists = await storage.exists('path/to/file.txt');

// List files with a prefix
const files = await storage.list('path/to/');

// Generate a read pre-signed URL
const { url } = await storage.createReadPresignedUrl('path/to/file.txt');
```

### R2Storage

A storage implementation for Cloudflare R2.

**Location**: `src/services/storage/r2-storage.ts`

**Dependencies**:

- `@aws-sdk/client-s3` (R2 is S3-compatible)
- `@aws-sdk/s3-request-presigner`

**Usage**:

```typescript
import { R2Storage } from '../services/storage/r2-storage';

const storage = new R2Storage({
  bucket: 'my-bucket',
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
});

// Usage is identical to S3Storage
await storage.upload('path/to/file.txt', Buffer.from('Hello World'));
```

## Common Operations

### Writing Files

Write a file to the storage service:

```typescript
// Write a text file
await storage.write('path/to/file.txt', Buffer.from('Hello World'));

// Write a JSON file
const data = { name: 'Example', value: 42 };
await storage.write('path/to/file.json', Buffer.from(JSON.stringify(data)), {
  contentType: 'application/json',
});

// Write a binary file
const binaryData = await fs.readFile('local-file.pdf');
await storage.write('path/to/file.pdf', binaryData);
```

### Reading Files

Read a file from the storage service:

```typescript
// Read a file
const buffer = await storage.read('path/to/file.txt');
const content = buffer.toString('utf-8');

// Read and parse JSON
const jsonBuffer = await storage.read('path/to/file.json');
const jsonData = JSON.parse(jsonBuffer.toString('utf-8'));
```

### Working with Folders

Storage services use key prefixes to simulate folders:

```typescript
// List all files in a "folder"
const files = await storage.list('users/123/');

// Delete all files in a "folder"
const filesToDelete = await storage.list('users/123/');
await storage.deleteMany(filesToDelete);
```

### Pre-signed URLs

Generate temporary URLs for direct access:

```typescript
// Generate a read URL
const { url } = await storage.createReadPresignedUrl('path/to/file.jpg');

// Use in HTML
const html = `<img src="${url}" alt="My Image">`;

// Generate a direct-upload URL
const upload = await storage.createWritePresignedUrl('documents/report.pdf', {
  contentType: 'application/pdf',
  maxBytes: 10 * 1024 * 1024,
});
```

## Best Practices

1. **Error Handling**: Always handle potential errors from storage operations:

```typescript
try {
  await storage.upload('path/to/file.txt', buffer);
} catch (error) {
  console.error('Failed to upload file:', error);
  // Handle error appropriately
}
```

2. **Using Environment Variables**: Store sensitive credentials in environment variables:

```typescript
const storage = new S3Storage({
  bucket: process.env.S3_BUCKET!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: process.env.AWS_REGION!,
});
```

3. **File Organization**: Use a consistent key structure for better organization:

```typescript
// Example key structure
const userProfileKey = `users/${userId}/profile.json`;
const userDocumentKey = `users/${userId}/documents/${documentId}.pdf`;
```

4. **Metadata Handling**: Prefer object metadata when your provider supports it:

```typescript
await storage.write(key, buffer, {
  contentType: 'application/pdf',
  metadata: {
    source: 'reports',
    reportId,
  },
});
```

## Custom Implementations

You can create your own storage implementation by extending the `AbstractStorage` class:

```typescript
import { AbstractStorage, StorageOptions } from '../services/storage/abstract-storage';

interface MyStorageOptions extends StorageOptions {
  customOption: string;
}

export class MyStorage extends AbstractStorage {
  constructor(options: MyStorageOptions) {
    super(options);
    // Initialize your storage client
  }

  async write(key: string, data: StorageBody): Promise<void> {
    // Implement write logic
  }

  async read(key: string): Promise<Buffer> {
    // Implement read logic
  }

  async delete(key: string): Promise<void> {
    // Implement delete logic
  }

  async exists(key: string): Promise<boolean> {
    // Implement exists logic
  }

  async listPage(prefix?: string): Promise<{ keys: string[] }> {
    // Implement paginated list logic
  }

  async createReadPresignedUrl(key: string) {
    // Implement read pre-signed URL generation
  }

  async createWritePresignedUrl(
    key: string,
    opts: StorageWritePresignedUrlOptions
  ) {
    // Implement write pre-signed URL generation
  }
}
```
