import { S3Storage } from './s3-storage';
import { StorageOptions } from './abstract-storage';

interface R2StorageOptions extends StorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2Storage extends S3Storage {
  constructor(options: R2StorageOptions) {
    super({
      ...options,
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
    });
  }
}
