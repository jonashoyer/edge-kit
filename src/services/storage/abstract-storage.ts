export interface StorageOptions {
  region?: string;
  endpoint?: string;
}

export type StorageBody = string | Uint8Array | ArrayBuffer | Blob;

export interface StorageWriteOptions {
  contentType?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageExplorerListPageOptions {
  maxKeys?: number;
  continuationToken?: string;
}

export interface StorageExplorerListPageResult {
  keys: string[];
  continuationToken?: string;
}

export interface StorageExplorerCapability {
  listPage(
    prefix?: string,
    options?: StorageExplorerListPageOptions
  ): Promise<StorageExplorerListPageResult>;
  list(prefix?: string): Promise<string[]>;
}

export interface StorageWritePresignedUrlOptions {
  contentType: string;
  maxBytes?: number;
  minBytes?: number;
  bytesLimit?: number;
}

export interface StorageObjectMetadata<TMeta = never> {
  contentLength: number;
  contentType?: string;
  etag?: string;
  lastModified?: number;
  meta: TMeta;
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
