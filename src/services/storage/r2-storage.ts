import type { StorageOptions } from './abstract-storage';
import { S3Storage } from './s3-storage';

interface R2StorageOptions extends StorageOptions {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  secretAccessKey: string;
}

/**
 * Cloudflare R2 implementation of AbstractStorage.
 * Configures the S3Storage client to work with Cloudflare R2 endpoints.
 */
export class R2Storage extends S3Storage {
  override readonly immutable = undefined;
  override readonly multipart = undefined;

  constructor(options: R2StorageOptions) {
    super({
      ...options,
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
    });
  }
}
