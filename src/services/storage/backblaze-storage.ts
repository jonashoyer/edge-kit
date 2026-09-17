import { S3Storage, type S3StorageOptions } from './s3-storage';

interface BackblazeStorageOptions
  extends Omit<S3StorageOptions, 'maxAttempts' | 'versioning'> {
  endpoint: string;
  region: string;
}

/**
 * Backblaze B2 implementation of AbstractStorage (via S3 compatibility).
 * Thin configuration preset over `S3Storage`.
 * Callers must supply the exact B2 S3 endpoint and matching region from their
 * bucket details.
 */
export class BackblazeStorage extends S3Storage {
  constructor(options: BackblazeStorageOptions) {
    super({
      ...options,
      maxAttempts: 1,
      versioning: 'enabled',
    });
  }
}
