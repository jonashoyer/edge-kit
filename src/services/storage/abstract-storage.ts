import { CustomError } from '../../utils/custom-error';

export interface StorageOptions {
  endpoint?: string;
  region?: string;
}

export type StorageBody = string | Uint8Array | ArrayBuffer | Blob;

export interface StorageWriteOptions {
  contentType?: string;
  metadata?: Record<string, unknown>;
}

export type StorageVersioningMode = 'enabled' | 'disabled';

export interface StorageExplorerListPageOptions {
  continuationToken?: string;
  maxKeys?: number;
}

export interface StorageExplorerListPageResult {
  continuationToken?: string;
  keys: string[];
}

export interface StorageExplorerCapability {
  list: (prefix?: string) => Promise<string[]>;
  listPage: (
    prefix?: string,
    options?: StorageExplorerListPageOptions
  ) => Promise<StorageExplorerListPageResult>;
}

export interface StorageWritePresignedUrlOptions {
  bytesLimit?: number;
  contentType: string;
  maxBytes?: number;
  minBytes?: number;
}

export interface StorageObjectChecksum {
  algorithm: string;
  value: string;
}

export interface StorageObjectReference {
  checksum?: StorageObjectChecksum;
  etag?: string;
  key: string;
  versionId?: string | null;
}

export interface StorageObjectMetadata<TMeta = never> {
  contentLength: number;
  contentType?: string;
  etag?: string;
  lastModified?: number;
  meta: TMeta;
}

export interface StorageObjectDescriptor<TMeta = never>
  extends StorageObjectReference,
    StorageObjectMetadata<TMeta> {}

export interface StorageReadObjectOptions {
  versionId?: string | null;
}

export interface StorageReadPresignedUrlOptions
  extends StorageReadObjectOptions {
  expiresInSeconds?: number;
}

export interface StorageCreateObjectOptions extends StorageWriteOptions {
  checksum?: StorageObjectChecksum;
}

export interface StorageCreateObjectResult<TMeta = never> {
  object: StorageObjectDescriptor<TMeta>;
  status: 'created' | 'already-exists';
}

export interface StorageDeleteObjectVersionError {
  code?: string;
  key: string;
  message: string;
  versionId?: string;
}

export interface StorageDeleteObjectOptions {
  mode?: 'current' | 'all-versions';
  versionId?: string | null;
}

export interface StorageMultipartUploadSession {
  key: string;
  uploadId: string;
}

export interface StorageMultipartUploadDescriptor
  extends StorageMultipartUploadSession {
  expectedBytes: number;
  partCount: number;
  partSizeBytes: number;
}

export interface StorageMultipartUploadOptions extends StorageWriteOptions {}

export interface StorageMultipartPart {
  etag: string;
  partNumber: number;
  sizeBytes: number;
}

export interface StorageMultipartPartInstruction {
  expiresAt: number;
  headers: Record<string, string>;
  key: string;
  lengthBytes: number;
  maxBytes: number;
  method: 'PUT';
  offsetBytes: number;
  partNumber: number;
  uploadId: string;
  url: string;
}

export interface StorageMultipartPartUrlOptions {
  contentType?: string;
}

export interface StorageMultipartCompleteOptions extends StorageWriteOptions {}

export type StorageMultipartUploadErrorReason =
  | 'invalid'
  | 'incomplete'
  | 'mismatch';

/**
 * Optional immutable object capability for providers that can expose stable
 * object references, create-only publication, version-pinned reads, and
 * explicit cleanup semantics.
 */
export interface StorageImmutableCapability {
  createObject: <TMeta = never>(
    key: string,
    data: StorageBody,
    options?: StorageCreateObjectOptions
  ) => Promise<StorageCreateObjectResult<TMeta>>;
  createReadPresignedUrl: (
    ref: StorageObjectReference,
    options?: StorageReadPresignedUrlOptions
  ) => Promise<{ url: string; expiresAt: number }>;
  delete: (key: string, options?: StorageDeleteObjectOptions) => Promise<void>;

  head: <TMeta = never>(
    key: string,
    options?: StorageReadObjectOptions
  ) => Promise<StorageObjectDescriptor<TMeta> | null>;
  read: (
    ref: StorageObjectReference,
    options?: StorageReadObjectOptions
  ) => Promise<Buffer>;
  readonly versioning: StorageVersioningMode;
}

/**
 * Optional multipart capability for providers that can manage upload sessions,
 * sign individual parts, validate part listings, and complete or abort on the
 * server side.
 */
export interface StorageMultipartCapability {
  abort: (upload: StorageMultipartUploadSession) => Promise<void>;
  complete: <TMeta = never>(
    upload: StorageMultipartUploadDescriptor,
    options?: StorageMultipartCompleteOptions
  ) => Promise<StorageObjectDescriptor<TMeta>>;
  create: (
    key: string,
    options?: StorageMultipartUploadOptions
  ) => Promise<StorageMultipartUploadSession>;
  createPartPresignedUrl: (
    upload: StorageMultipartUploadDescriptor,
    partNumber: number,
    options?: StorageMultipartPartUrlOptions
  ) => Promise<StorageMultipartPartInstruction>;
  find: (key: string) => Promise<StorageMultipartUploadSession[]>;
  listParts: (
    upload: StorageMultipartUploadSession
  ) => Promise<StorageMultipartPart[]>;
}

const isBlobLike = (value: unknown): value is Blob =>
  typeof Blob !== 'undefined' && value instanceof Blob;

export const storageMetadataToStrings = (
  metadata: Record<string, unknown> | undefined
): Record<string, string> | undefined => {
  if (!metadata) {
    return;
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, String(value)])
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const storageBodyToUint8Array = async (
  data: StorageBody
): Promise<Uint8Array> => {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (isBlobLike(data)) {
    return new Uint8Array(await data.arrayBuffer());
  }

  return new Uint8Array(data);
};

/**
 * Abstract base class for object storage services.
 * Defines standard methods for reading, writing, deleting, and inspecting
 * individual objects. Optional browse behavior hangs off `storage.explorer`
 * when the provider supports flat key listing.
 */
export abstract class AbstractStorage {
  protected options: StorageOptions;
  readonly explorer?: StorageExplorerCapability;
  readonly immutable?: StorageImmutableCapability;
  readonly multipart?: StorageMultipartCapability;

  constructor(options: StorageOptions) {
    this.options = options;
  }

  abstract write(
    key: string,
    data: StorageBody,
    opts?: StorageWriteOptions
  ): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      // biome-ignore lint/performance/noAwaitInLoops: Delete sequentially to preserve fail-fast behavior across storage providers.
      await this.delete(key);
    }
  }

  abstract createReadPresignedUrl(
    key: string
  ): Promise<{ url: string; expiresAt: number }>;
  abstract createWritePresignedUrl(
    key: string,
    opts: StorageWritePresignedUrlOptions
  ): Promise<{
    url: string;
    fields?: Record<string, string>; // present for POST, absent for PUT
    method: 'POST' | 'PUT';
    expiresAt: number;
  }>;

  abstract objectMetadata<TMeta = never>(
    key: string
  ): Promise<StorageObjectMetadata<TMeta>>;
}

export class ObjectStorageExistsError extends Error {
  constructor(key: string) {
    super(`Object storage key already exists: ${key}`);
  }
}

export class StorageDeleteObjectError extends CustomError<'DELETE_FAILED'> {
  readonly errors: StorageDeleteObjectVersionError[];

  constructor(key: string, errors: StorageDeleteObjectVersionError[]) {
    super(`Object storage cleanup failed for key: ${key}`, 'DELETE_FAILED');
    this.errors = errors;
  }
}

export class StorageMultipartUploadError extends CustomError<'INVALID_UPLOAD'> {
  readonly reason: StorageMultipartUploadErrorReason;

  constructor(
    message: string,
    reason: StorageMultipartUploadErrorReason = 'invalid'
  ) {
    super(message, 'INVALID_UPLOAD');
    this.reason = reason;
  }
}
