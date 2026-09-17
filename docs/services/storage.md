# Storage Services

Edge Kit provides object-storage abstractions plus concrete providers for
S3-compatible backends and the local filesystem.

Copy the storage component files you need, plus the focused tests that cover
the provider behavior you depend on. Edge Kit is not presenting storage as a
required runtime package dependency.

## Overview

The storage family is split into:

- object-level operations on `AbstractStorage`
- optional browse support on `storage.explorer`
- optional immutable-object operations on `storage.immutable`
- optional multipart session operations on `storage.multipart`
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

type StorageObjectReference = {
  key: string;
  etag?: string;
  versionId?: string | null;
  checksum?: { algorithm: string; value: string };
};

type StorageObjectDescriptor<TMeta = never> = StorageObjectReference & {
  contentLength: number;
  contentType?: string;
  lastModified?: number;
  meta: TMeta;
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
  readonly immutable?: StorageImmutableCapability;
  readonly multipart?: StorageMultipartCapability;

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

## Immutable Capability

Providers that can expose stable object references, create-only writes, pinned
reads, and explicit cleanup semantics attach `storage.immutable`.

```typescript
const storage = new S3Storage({
  bucket: 'recordings',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  maxAttempts: 1,
  versioning: 'enabled',
});

const result = await storage.immutable?.createObject(
  'transcripts/meeting-1.md',
  '# Meeting',
  {
    contentType: 'text/markdown; charset=utf-8',
  }
);

if (result?.status === 'already-exists') {
  // caller decides whether the existing object is acceptable
}

const pinned = await storage.immutable?.createReadPresignedUrl(
  result!.object
);

await storage.immutable?.delete('transcripts/meeting-1.md', {
  mode: 'all-versions',
});
```

`S3Storage` only exposes `storage.immutable` when the caller passes an explicit
`versioning: 'enabled' | 'disabled'` mode. Edge Kit does not probe bucket
versioning at runtime.

## Multipart Capability

Providers that can manage multipart sessions attach `storage.multipart`.

```typescript
const session = await storage.multipart?.create('recordings/original.webm', {
  contentType: 'video/webm',
  metadata: { uploadId: 'upload-123' },
});

const upload = {
  key: session!.key,
  uploadId: session!.uploadId,
  expectedBytes: 20 * 1024 * 1024,
  partSizeBytes: 8 * 1024 * 1024,
  partCount: 3,
};

const part = await storage.multipart?.createPartPresignedUrl(upload, 3, {
  contentType: 'video/webm',
});

const object = await storage.multipart?.complete(upload, {
  contentType: 'video/webm',
});
```

Multipart uploads stay low-level on purpose:

- callers choose part sizes and persist operation identity themselves
- part URLs are signed for exact byte ranges only
- completion validates part ordering and sizes before finalizing
- abort verification only proves whether parts still remain visible after the
  abort attempt; it does not claim in-flight writes were stopped

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
explorer support. It can also expose `storage.immutable` when `versioning` is
configured explicitly, plus `storage.multipart` for S3 multipart sessions.

**Location**: `src/services/storage/s3-storage.ts`

### R2Storage

Cloudflare R2 provider built on top of the S3-compatible implementation.
Immutable and multipart capabilities are intentionally not advertised here
yet. That is a repository verification limit, not a claim that the provider
lacks those APIs.

**Location**: `src/services/storage/r2-storage.ts`

### BackblazeStorage

Backblaze B2 preset built on top of the shared `S3Storage` implementation.
Callers must pass the exact B2 S3 endpoint and matching region from Backblaze
bucket details. The preset pins `versioning: 'enabled'` and `maxAttempts: 1`
to match the shared immutable and multipart semantics.

**Location**: `src/services/storage/backblaze-storage.ts`

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

## Provider Notes

### Backblaze B2

- Official Backblaze docs describe the B2 S3-compatible API as supporting
  multipart upload actions, version-listing actions, and AWS SDK for
  JavaScript v3 configuration with a caller-supplied endpoint and matching
  region.
- `BackblazeStorage` is therefore a thin preset over the shared `S3Storage`
  implementation instead of a separate adapter with duplicated operations.
- Backblaze also documents some S3 incompatibilities, including limited ACL
  support and unsupported object tagging. Edge Kit's current storage surface
  does not rely on those features, but that does not make AWS S3 and B2
  identical.
- This repository has not run live B2 integration tests. Documented protocol
  support and shared unit tests are the current evidence, not a deployment
  guarantee.

### Cloudflare R2

- `R2Storage` remains a convenience endpoint preset only.
- Edge Kit does not currently advertise immutable or multipart capabilities on
  `R2Storage` because this repository has not yet validated the provider's
  behavior for the exact create-only, version-aware cleanup, and abort
  semantics the optional capabilities promise.

## Custom Implementations

You can create a custom provider by extending `AbstractStorage`. Add
`explorer`, `immutable`, and `multipart` only when the provider can uphold the
corresponding guarantees natively.

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
