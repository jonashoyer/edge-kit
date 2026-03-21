# Storage Services

Edge Kit provides object-storage abstractions plus concrete providers for
S3-compatible backends and the local filesystem.

## Overview

The storage family is split into:

- object-level operations on `AbstractStorage`
- optional browse support on `storage.explorer`
- directory-style convenience helpers in `StorageInventoryService`

This keeps the base provider contract small while still allowing providers
that support listing to expose browsing.

## Abstract Storage Service

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

type StorageExplorerListPageOptions = {
  maxKeys?: number;
  continuationToken?: string;
};

type StorageExplorerCapability = {
  listPage(
    prefix?: string,
    options?: StorageExplorerListPageOptions
  ): Promise<{ keys: string[]; continuationToken?: string }>;
  list(prefix?: string): Promise<string[]>;
};

abstract class AbstractStorage {
  readonly explorer?: StorageExplorerCapability;

  abstract write(
    key: string,
    data: StorageBody,
    opts?: StorageWriteOptions
  ): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  async deleteMany(keys: string[]): Promise<void>;
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

## Explorer Capability

Providers that support flat key listing expose `storage.explorer`.

```typescript
const storage = new S3Storage({
  bucket: 'my-bucket',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: 'us-east-1',
});

const page = await storage.explorer?.listPage('users/123/', {
  maxKeys: 50,
});

const keys = await storage.explorer?.list('users/123/');
```

Explorer support returns flat keys only. It does not model folders or mixed
directory/file entry types.

## Browse Helper

Use `StorageInventoryService` when you want a directory-like projection over
flat keys.

```typescript
import { StorageInventoryService } from '../services/storage/storage-inventory';

const inventory = new StorageInventoryService({ storage });

const listing = await inventory.listDirectory('users/123/');

// {
//   prefix: 'users/123/',
//   directories: ['docs'],
//   objects: [{ key: 'users/123/avatar.png', name: 'avatar.png' }]
// }
```

This directory view is derived from flat keys. It is a convenience projection,
not a filesystem guarantee.

## Available Implementations

### S3Storage

AWS S3-compatible storage provider with object operations plus optional
explorer support.

**Location**: `src/services/storage/s3-storage.ts`

### R2Storage

Cloudflare R2 provider built on top of the S3-compatible implementation.

**Location**: `src/services/storage/r2-storage.ts`

### LocalStorage

Local filesystem-backed storage provider for development and testing.

**Location**: `src/services/storage/local-storage.ts`

## Common Operations

### Writing files

```typescript
await storage.write('reports/summary.json', JSON.stringify({ ok: true }), {
  contentType: 'application/json',
  metadata: {
    source: 'reports',
  },
});
```

### Reading files

```typescript
const buffer = await storage.read('reports/summary.json');
const content = JSON.parse(buffer.toString('utf8'));
```

### Browsing keys

```typescript
const keys = await storage.explorer?.list('users/123/');
```

### Browsing directory projections

```typescript
const inventory = new StorageInventoryService({ storage });
const listing = await inventory.listDirectory('users/123/');
```

### Presigned URLs

```typescript
const readUrl = await storage.createReadPresignedUrl('images/logo.png');

const upload = await storage.createWritePresignedUrl('documents/report.pdf', {
  contentType: 'application/pdf',
  maxBytes: 10 * 1024 * 1024,
});
```

## Custom Implementations

You can create a custom provider by extending `AbstractStorage`. Add
`explorer` only if your provider supports flat key listing.

```typescript
import type {
  StorageBody,
  StorageExplorerCapability,
  StorageOptions,
  StorageWritePresignedUrlOptions,
} from '../services/storage/abstract-storage';
import { AbstractStorage } from '../services/storage/abstract-storage';

interface MyStorageOptions extends StorageOptions {
  customOption: string;
}

export class MyStorage extends AbstractStorage {
  override readonly explorer?: StorageExplorerCapability;

  constructor(options: MyStorageOptions) {
    super(options);
  }

  async write(key: string, data: StorageBody): Promise<void> {}

  async read(key: string): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async delete(key: string): Promise<void> {}

  async exists(key: string): Promise<boolean> {
    return false;
  }

  async createReadPresignedUrl(key: string) {
    return {
      url: `https://example.test/${key}`,
      expiresAt: Date.now() + 60_000,
    };
  }

  async createWritePresignedUrl(
    key: string,
    opts: StorageWritePresignedUrlOptions
  ) {
    return {
      url: `https://example.test/${key}`,
      method: 'PUT' as const,
      expiresAt: Date.now() + 60_000,
    };
  }

  async objectMetadata() {
    return {
      contentLength: 0,
      meta: undefined as never,
    };
  }
}
```
