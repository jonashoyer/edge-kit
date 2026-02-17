import type { StorageOptions } from './abstract-storage';
import { S3Storage } from './s3-storage';

interface R2StorageOptions extends StorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Backblaze B2 implementation of AbstractStorage (via S3 compatibility).
 * Configures the S3Storage client to work with Backblaze B2 endpoints.
 */
export class BackblazeStorage extends S3Storage {
  constructor(options: R2StorageOptions) {
    // FIXME: Configure for backblaze
    super({
      ...options,
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
    });
  }
}
