export interface StorageOptions {
  region?: string;
  endpoint?: string;
}

export abstract class AbstractStorage {
  protected options: StorageOptions;
  constructor(options: StorageOptions) {
    this.options = options;
  }

  abstract write(
    key: string,
    data: Buffer,
    opts?: { metadata?: Record<string, unknown> }
  ): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract list(prefix?: string): Promise<string[]>;

  abstract createReadPresignedUrl(
    key: string
  ): Promise<{ url: string; expiresAt: number }>;
  abstract createWritePresignedUrl(
    key: string,
    opts: { contentType: string; bytesLimit: number }
  ): Promise<{
    url: string;
    fields?: Record<string, string>; // present for POST, absent for PUT
    method: "POST" | "PUT";
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

export class ObjectStorageExistsError extends Error {
  constructor(key: string) {
    super(`Object storage key already exists: ${key}`);
  }
}
