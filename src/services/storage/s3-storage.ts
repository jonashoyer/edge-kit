import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  AbstractStorage,
  type StorageBody,
  type StorageExplorerCapability,
  type StorageExplorerListPageOptions,
  type StorageOptions,
  type StorageWriteOptions,
  type StorageWritePresignedUrlOptions,
  storageMetadataToStrings,
} from './abstract-storage';

const createCompatiblePresignedPost = async (
  client: S3Client,
  options: Parameters<typeof createPresignedPost>[1]
) => {
  return await createPresignedPost(
    client as unknown as Parameters<typeof createPresignedPost>[0],
    options
  );
};

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
  private readonly endpoint?: string;
  override readonly explorer: StorageExplorerCapability;

  private readonly presignedTtlSeconds = 3600;
  private readonly presignedTtlMs = this.presignedTtlSeconds * 1000;

  constructor(options: S3StorageOptions) {
    super(options);
    this.bucket = options.bucket;
    this.endpoint = options.endpoint;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    this.explorer = {
      list: async (prefix?: string) => {
        const keys: string[] = [];
        let continuationToken: string | undefined;

        do {
          const page = await this.explorer.listPage(prefix, {
            continuationToken,
          });
          keys.push(...page.keys);
          continuationToken = page.continuationToken;
        } while (continuationToken);

        return keys;
      },
      listPage: async (
        prefix?: string,
        pageOptions?: StorageExplorerListPageOptions
      ) => {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            MaxKeys: pageOptions?.maxKeys,
            ContinuationToken: pageOptions?.continuationToken,
          })
        );

        return {
          keys:
            response.Contents?.map((object) => object.Key).filter(
              (key): key is string => typeof key === 'string'
            ) ?? [],
          continuationToken: response.NextContinuationToken,
        };
      },
    };
  }

  async write(
    key: string,
    data: StorageBody,
    opts?: StorageWriteOptions
  ): Promise<void> {
    const body = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: opts?.contentType,
        Metadata: storageMetadataToStrings(opts?.metadata),
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

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  override async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
          Quiet: false,
        },
      })
    );
  }

  async createReadPresignedUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.presignedTtlSeconds,
    });

    return {
      url,
      expiresAt: Date.now() + this.presignedTtlMs,
    };
  }

  async createWritePresignedUrl(
    key: string,
    opts: StorageWritePresignedUrlOptions
  ) {
    const maxBytes = opts.maxBytes ?? opts.bytesLimit;
    const minBytes = opts.minBytes ?? 0;

    if (this.isBackblazeEndpoint()) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: opts.contentType,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: this.presignedTtlSeconds,
      });

      return {
        url,
        method: 'PUT' as const,
        expiresAt: Date.now() + this.presignedTtlMs,
      };
    }

    const conditions = [{ 'Content-Type': opts.contentType }] as NonNullable<
      Parameters<typeof createPresignedPost>[1]['Conditions']
    >;
    if (maxBytes !== undefined) {
      conditions.push([
        'content-length-range',
        minBytes,
        maxBytes,
      ] as unknown as (typeof conditions)[number]);
    }

    const { url, fields } = await createCompatiblePresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: conditions,
      Fields: {
        'Content-Type': opts.contentType,
        key,
      },
      Expires: this.presignedTtlSeconds,
    });

    return {
      url,
      fields,
      method: 'POST' as const,
      expiresAt: Date.now() + this.presignedTtlMs,
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

  private isBackblazeEndpoint(): boolean {
    return (
      typeof this.endpoint === 'string' && this.endpoint.includes('backblazeb2')
    );
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error && typeof error === 'object')) {
      return false;
    }

    const record = error as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    return (
      record.name === 'NotFound' ||
      record.name === 'NoSuchKey' ||
      record.Code === 'NotFound' ||
      record.$metadata?.httpStatusCode === 404
    );
  }
}
