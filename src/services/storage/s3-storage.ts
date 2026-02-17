import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AbstractStorage, type StorageOptions } from './abstract-storage';

interface S3StorageOptions extends StorageOptions {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * AWS S3 implementation of AbstractStorage.
 * Uses the `@aws-sdk/client-s3` to interact with S3-compatible storage services.
 * Supports presigned URLs for secure client-side uploads/downloads.
 */
export class S3Storage extends AbstractStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  private readonly presignedTtl = 3600;

  constructor(options: S3StorageOptions) {
    super(options);
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async write(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      })
    );
  }

  async read(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    return Buffer.from(await response.Body!.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async list(prefix?: string): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );
    return response.Contents?.map((object) => object.Key!) ?? [];
  }

  async createReadPresignedUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: Math.round(this.presignedTtl / 1000),
    });

    return {
      url,
      expiresAt: Date.now() + this.presignedTtl,
    };
  }

  async createWritePresignedUrl(
    key: string,
    opts: { contentType: string; bytesLimit: number }
  ) {
    // FIXME: Add support for bytesLimit
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.presignedTtl,
    });

    return {
      url,
      method: 'POST' as const,
      expiresAt: Date.now() + this.presignedTtl,
    };
  }
  async objectMetadata<TMeta = never>(key: string) {
    const headCommand = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const head = await this.client.send(headCommand);

    return {
      contentLength: head.ContentLength ?? 0,
      contentType: head.ContentType,
      etag: head.ETag,
      lastModified: head.LastModified ? head.LastModified.getTime() : undefined,
      meta: (head.Metadata ?? undefined) as TMeta,
    };
  }
}
