import type { StorageOptions } from './abstract-storage';
import { S3Storage } from './s3-storage';

interface R2StorageOptions extends StorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Cloudflare R2 implementation of AbstractStorage.
 * Configures the S3Storage client to work with Cloudflare R2 endpoints.
 */
export class R2Storage extends S3Storage {
  constructor(options: R2StorageOptions) {
    super({
      ...options,
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
    });
  }
}
