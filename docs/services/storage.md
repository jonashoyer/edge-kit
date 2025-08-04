# Storage Services

Edge Kit provides abstract and concrete implementations for cloud storage services, allowing you to store and retrieve files in various cloud storage providers.

## Overview

The storage services allow you to:

- Upload files to cloud storage
- Download files from cloud storage
- Delete files from cloud storage
- List files in cloud storage
- Generate pre-signed URLs for temporary access

## Abstract Storage Service

The `AbstractStorage` class defines the interface that all storage implementations must follow:

```typescript
export abstract class AbstractStorage {
  constructor(protected options: StorageOptions) {}

  abstract upload(key: string, data: Buffer): Promise<void>;
  abstract download(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract list(prefix?: string): Promise<string[]>;
  abstract getPresignedUrl(key: string, expiresIn: number): Promise<string>;
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

// Upload a file
await storage.upload('path/to/file.txt', Buffer.from('Hello World'));

// Download a file
const data = await storage.download('path/to/file.txt');

// Delete a file
await storage.delete('path/to/file.txt');

// List files with a prefix
const files = await storage.list('path/to/');

// Generate a pre-signed URL (valid for 1 hour)
const url = await storage.getPresignedUrl('path/to/file.txt', 3600);
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

### Uploading Files

Upload a file to the storage service:

```typescript
// Upload a text file
await storage.upload('path/to/file.txt', Buffer.from('Hello World'));

// Upload a JSON file
const data = { name: 'Example', value: 42 };
await storage.upload('path/to/file.json', Buffer.from(JSON.stringify(data)));

// Upload a binary file
const binaryData = await fs.readFile('local-file.pdf');
await storage.upload('path/to/file.pdf', binaryData);
```

### Downloading Files

Download a file from the storage service:

```typescript
// Download a file
const buffer = await storage.download('path/to/file.txt');
const content = buffer.toString('utf-8');

// Download and parse JSON
const jsonBuffer = await storage.download('path/to/file.json');
const jsonData = JSON.parse(jsonBuffer.toString('utf-8'));
```

### Working with Folders

Storage services use key prefixes to simulate folders:

```typescript
// List all files in a "folder"
const files = await storage.list('users/123/');

// Delete all files in a "folder" (one by one)
const filesToDelete = await storage.list('users/123/');
await Promise.all(filesToDelete.map((file) => storage.delete(file)));
```

### Pre-signed URLs

Generate temporary URLs for direct access:

```typescript
// Generate a URL valid for 1 hour
const url = await storage.getPresignedUrl('path/to/file.jpg', 3600);

// Use in HTML
const html = `<img src="${url}" alt="My Image">`;

// Share temporary download link
const downloadLink = await storage.getPresignedUrl('documents/report.pdf', 86400); // 24 hours
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

4. **Content Type Handling**: Consider storing content type metadata for files:

```typescript
// Store content type in a separate metadata file or in your application database
await storage.upload(`${key}.meta`, Buffer.from(JSON.stringify({ contentType: 'application/pdf' })));
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

  async upload(key: string, data: Buffer): Promise<void> {
    // Implement upload logic
  }

  async download(key: string): Promise<Buffer> {
    // Implement download logic
  }

  async delete(key: string): Promise<void> {
    // Implement delete logic
  }

  async list(prefix?: string): Promise<string[]> {
    // Implement list logic
  }

  async getPresignedUrl(key: string, expiresIn: number): Promise<string> {
    // Implement pre-signed URL generation
  }
}
```
