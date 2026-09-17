import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  ListPartsCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  AbstractStorage,
  ObjectStorageExistsError,
  type StorageBody,
  type StorageCreateObjectOptions,
  type StorageCreateObjectResult,
  StorageDeleteObjectError,
  type StorageDeleteObjectOptions,
  type StorageDeleteObjectVersionError,
  type StorageExplorerCapability,
  type StorageExplorerListPageOptions,
  type StorageImmutableCapability,
  type StorageMultipartCapability,
  type StorageMultipartCompleteOptions,
  type StorageMultipartPart,
  type StorageMultipartPartInstruction,
  type StorageMultipartPartUrlOptions,
  type StorageMultipartUploadDescriptor,
  StorageMultipartUploadError,
  type StorageMultipartUploadOptions,
  type StorageMultipartUploadSession,
  type StorageObjectChecksum,
  type StorageObjectDescriptor,
  type StorageObjectMetadata,
  type StorageObjectReference,
  type StorageOptions,
  type StorageReadObjectOptions,
  type StorageVersioningMode,
  type StorageWriteOptions,
  type StorageWritePresignedUrlOptions,
  storageMetadataToStrings,
} from './abstract-storage';

const S3_DELETE_BATCH_SIZE = 1000;

const createCompatiblePresignedPost = async (
  client: S3Client,
  options: Parameters<typeof createPresignedPost>[1]
) => {
  return await createPresignedPost(
    client as unknown as Parameters<typeof createPresignedPost>[0],
    options
  );
};

export interface S3StorageOptions extends StorageOptions {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  maxAttempts?: number;
  versioning?: StorageVersioningMode;
}

const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

type S3CompatibleBody = Exclude<StorageBody, ArrayBuffer>;

const normalizeBody = (data: StorageBody): S3CompatibleBody =>
  data instanceof ArrayBuffer ? new Uint8Array(data) : data;

const getErrorStatusCode = (error: unknown): number | undefined => {
  if (!(error && typeof error === 'object')) {
    return;
  }

  const record = error as { $metadata?: { httpStatusCode?: number } };
  return record.$metadata?.httpStatusCode;
};

const getErrorCode = (error: unknown): string | undefined => {
  if (!(error && typeof error === 'object')) {
    return;
  }

  const record = error as { name?: string; Code?: string; code?: string };
  return record.name ?? record.Code ?? record.code;
};

const isNotFoundError = (error: unknown): boolean => {
  const errorCode = getErrorCode(error);

  return (
    errorCode === 'NotFound' ||
    errorCode === 'NoSuchKey' ||
    errorCode === 'NoSuchUpload' ||
    getErrorStatusCode(error) === 404
  );
};

const toChecksum = (
  head: HeadObjectCommandOutput
): StorageObjectChecksum | undefined => {
  if (head.ChecksumSHA256) {
    return { algorithm: 'sha256', value: head.ChecksumSHA256 };
  }

  if (head.ChecksumSHA1) {
    return { algorithm: 'sha1', value: head.ChecksumSHA1 };
  }

  if (head.ChecksumCRC32C) {
    return { algorithm: 'crc32c', value: head.ChecksumCRC32C };
  }

  if (head.ChecksumCRC32) {
    return { algorithm: 'crc32', value: head.ChecksumCRC32 };
  }
};

const toPutChecksumOptions = (
  checksum: StorageObjectChecksum | undefined
): Partial<PutObjectCommandInput> => {
  if (!checksum) {
    return {};
  }

  const algorithm = checksum.algorithm.toLowerCase();

  switch (algorithm) {
    case 'sha256': {
      return {
        ChecksumAlgorithm: 'SHA256',
        ChecksumSHA256: checksum.value,
      };
    }
    case 'sha1': {
      return {
        ChecksumAlgorithm: 'SHA1',
        ChecksumSHA1: checksum.value,
      };
    }
    case 'crc32': {
      return {
        ChecksumAlgorithm: 'CRC32',
        ChecksumCRC32: checksum.value,
      };
    }
    case 'crc32c': {
      return {
        ChecksumAlgorithm: 'CRC32C',
        ChecksumCRC32C: checksum.value,
      };
    }
    default: {
      throw new Error(
        `Unsupported S3 checksum algorithm for single-part writes: ${checksum.algorithm}`
      );
    }
  }
};

const assertMultipartDescriptor = (
  upload: StorageMultipartUploadDescriptor
): void => {
  if (upload.key.length === 0) {
    throw new StorageMultipartUploadError('Multipart upload key is required');
  }

  if (upload.uploadId.length === 0) {
    throw new StorageMultipartUploadError(
      'Multipart upload identifier is required'
    );
  }

  if (!isSafeInteger(upload.expectedBytes) || upload.expectedBytes <= 0) {
    throw new StorageMultipartUploadError(
      'Multipart expectedBytes must be a positive safe integer'
    );
  }

  if (!isSafeInteger(upload.partSizeBytes) || upload.partSizeBytes <= 0) {
    throw new StorageMultipartUploadError(
      'Multipart partSizeBytes must be a positive safe integer'
    );
  }

  if (!isSafeInteger(upload.partCount) || upload.partCount <= 0) {
    throw new StorageMultipartUploadError(
      'Multipart partCount must be a positive safe integer'
    );
  }
};

/**
 * AWS S3 implementation of AbstractStorage.
 * Uses the `@aws-sdk/client-s3` to interact with S3-compatible storage
 * services while exposing optional immutable-object and multipart
 * capabilities for callers that need them.
 */
export class S3Storage extends AbstractStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint?: string;
  private readonly versioning?: StorageVersioningMode;

  override readonly explorer: StorageExplorerCapability;
  override readonly multipart: StorageMultipartCapability | undefined;
  override readonly immutable: StorageImmutableCapability | undefined;

  private readonly presignedTtlSeconds = 3600;
  private readonly presignedTtlMs = this.presignedTtlSeconds * 1000;
  private readonly multipartPresignedTtlSeconds = 900;
  private readonly multipartPresignedTtlMs =
    this.multipartPresignedTtlSeconds * 1000;

  constructor(options: S3StorageOptions) {
    super(options);
    this.bucket = options.bucket;
    this.endpoint = options.endpoint;
    this.versioning = options.versioning;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      maxAttempts: options.maxAttempts,
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
    this.immutable = this.versioning
      ? {
          versioning: this.versioning,
          head: async <TMeta = never>(
            key: string,
            readOptions?: StorageReadObjectOptions
          ) => {
            return await this.headObject<TMeta>(key, readOptions);
          },
          read: async (
            ref: StorageObjectReference,
            readOptions?: StorageReadObjectOptions
          ) => {
            return await this.readObject(ref, readOptions);
          },
          createObject: async <TMeta = never>(
            key: string,
            data: StorageBody,
            createOptions?: StorageCreateObjectOptions
          ) => {
            return await this.createObject<TMeta>(key, data, createOptions);
          },
          createReadPresignedUrl: async (
            ref: StorageObjectReference,
            readOptions?: StorageReadObjectOptions
          ) => {
            return await this.createPinnedReadPresignedUrl(ref, readOptions);
          },
          delete: async (
            key: string,
            deleteOptions?: StorageDeleteObjectOptions
          ) => {
            await this.deleteObject(key, deleteOptions);
          },
        }
      : undefined;
    this.multipart = {
      create: async (key: string, options?: StorageMultipartUploadOptions) => {
        await this.assertSingleWriteAttempt();
        const response = await this.client.send(
          new CreateMultipartUploadCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: options?.contentType,
            Metadata: storageMetadataToStrings(options?.metadata),
          })
        );

        if (!response.UploadId) {
          throw new StorageMultipartUploadError(
            'Storage did not return a multipart upload ID'
          );
        }

        return {
          key,
          uploadId: response.UploadId,
        };
      },
      find: async (key: string) => {
        return await this.findMultipartUploads(key);
      },
      listParts: async (upload: StorageMultipartUploadSession) => {
        return await this.listMultipartParts(upload);
      },
      createPartPresignedUrl: async (
        upload: StorageMultipartUploadDescriptor,
        partNumber: number,
        options?: StorageMultipartPartUrlOptions
      ) => {
        return await this.createMultipartPartPresignedUrl(
          upload,
          partNumber,
          options
        );
      },
      complete: async <TMeta = never>(
        upload: StorageMultipartUploadDescriptor,
        options?: StorageMultipartCompleteOptions
      ) => {
        return await this.completeMultipartUpload<TMeta>(upload, options);
      },
      abort: async (upload: StorageMultipartUploadSession) => {
        await this.abortMultipartUpload(upload);
      },
    };
  }

  async write(
    key: string,
    data: StorageBody,
    opts?: StorageWriteOptions
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: normalizeBody(data),
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
      if (isNotFoundError(error)) {
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

  async objectMetadata<TMeta = never>(
    key: string
  ): Promise<StorageObjectMetadata<TMeta>> {
    const descriptor = await this.requireHeadObject<TMeta>(key);

    return {
      contentLength: descriptor.contentLength,
      contentType: descriptor.contentType,
      etag: descriptor.etag,
      lastModified: descriptor.lastModified,
      meta: descriptor.meta,
    };
  }

  private async createObject<TMeta = never>(
    key: string,
    data: StorageBody,
    options?: StorageCreateObjectOptions
  ): Promise<StorageCreateObjectResult<TMeta>> {
    await this.assertSingleWriteAttempt();

    let status: StorageCreateObjectResult['status'] = 'created';

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: normalizeBody(data),
          ContentType: options?.contentType,
          Metadata: storageMetadataToStrings(options?.metadata),
          IfNoneMatch: '*',
          ...toPutChecksumOptions(options?.checksum),
        })
      );
    } catch (error) {
      if (getErrorStatusCode(error) !== 412) {
        throw error;
      }

      status = 'already-exists';
    }

    const object = await this.headObject<TMeta>(key);

    if (!object) {
      throw new ObjectStorageExistsError(key);
    }

    return {
      status,
      object,
    };
  }

  private async createPinnedReadPresignedUrl(
    ref: StorageObjectReference,
    options?: StorageReadObjectOptions
  ) {
    const versionId = this.resolveVersionId(ref, options);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: ref.key,
      VersionId: versionId,
      ResponseCacheControl: 'private, no-store',
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.presignedTtlSeconds,
    });

    return {
      url,
      expiresAt: Date.now() + this.presignedTtlMs,
    };
  }

  private async readObject(
    ref: StorageObjectReference,
    options?: StorageReadObjectOptions
  ): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: ref.key,
        VersionId: this.resolveVersionId(ref, options),
      })
    );

    return Buffer.from(await response.Body!.transformToByteArray());
  }

  private async headObject<TMeta = never>(
    key: string,
    options?: StorageReadObjectOptions
  ): Promise<StorageObjectDescriptor<TMeta> | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
          VersionId: options?.versionId ?? undefined,
        })
      );

      return this.toObjectDescriptor<TMeta>(key, head);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async requireHeadObject<TMeta = never>(
    key: string,
    options?: StorageReadObjectOptions
  ): Promise<StorageObjectDescriptor<TMeta>> {
    const descriptor = await this.headObject<TMeta>(key, options);

    if (!descriptor) {
      throw new Error(`Object not found: ${key}`);
    }

    return descriptor;
  }

  private async deleteObject(
    key: string,
    options?: StorageDeleteObjectOptions
  ): Promise<void> {
    const deleteMode = options?.mode ?? 'current';

    if (deleteMode === 'current') {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
          VersionId: options?.versionId ?? undefined,
        })
      );
      return;
    }

    if (this.versioning === 'disabled') {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return;
    }

    const errors = await this.deleteAllObjectVersions(key);

    if (errors.length > 0) {
      throw new StorageDeleteObjectError(key, errors);
    }
  }

  private async deleteAllObjectVersions(
    key: string
  ): Promise<StorageDeleteObjectVersionError[]> {
    const errors: StorageDeleteObjectVersionError[] = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        })
      );
      const batch = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((object) => object.Key === key)
        .map((object) => ({
          Key: key,
          VersionId: object.VersionId,
        }));

      for (const object of batch) {
        if (!object.VersionId) {
          throw new Error(
            `Missing object version during cleanup for key: ${key}`
          );
        }
      }

      if (batch.length > 0) {
        errors.push(...(await this.deleteObjectVersions(key, batch)));
      }

      if (!page.IsTruncated) {
        break;
      }

      if (
        !page.NextKeyMarker ||
        (page.NextKeyMarker === keyMarker &&
          page.NextVersionIdMarker === versionIdMarker)
      ) {
        throw new Error('Invalid object-version pagination state');
      }

      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    } while (keyMarker);

    return errors;
  }

  private async deleteObjectVersions(
    key: string,
    objects: Array<{ Key: string; VersionId?: string }>
  ): Promise<StorageDeleteObjectVersionError[]> {
    const errors: StorageDeleteObjectVersionError[] = [];

    for (
      let offset = 0;
      offset < objects.length;
      offset += S3_DELETE_BATCH_SIZE
    ) {
      const batch = objects.slice(offset, offset + S3_DELETE_BATCH_SIZE);
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch,
          },
        })
      );

      for (const error of response.Errors ?? []) {
        errors.push({
          key: error.Key ?? key,
          versionId: error.VersionId,
          code: error.Code,
          message: error.Message ?? 'Storage did not delete every object',
        });
      }
    }

    return errors;
  }

  private async findMultipartUploads(
    key: string
  ): Promise<StorageMultipartUploadSession[]> {
    const uploads: StorageMultipartUploadSession[] = [];
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;

    do {
      const page = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          Prefix: key,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        })
      );

      for (const upload of page.Uploads ?? []) {
        if (upload.Key === key && upload.UploadId) {
          uploads.push({
            key,
            uploadId: upload.UploadId,
          });
        }
      }

      if (!page.IsTruncated) {
        break;
      }

      if (
        !page.NextKeyMarker ||
        (page.NextKeyMarker === keyMarker &&
          page.NextUploadIdMarker === uploadIdMarker)
      ) {
        throw new Error('Invalid multipart pagination state');
      }

      keyMarker = page.NextKeyMarker;
      uploadIdMarker = page.NextUploadIdMarker;
    } while (keyMarker);

    return uploads;
  }

  private async listMultipartParts(
    upload: StorageMultipartUploadSession
  ): Promise<StorageMultipartPart[]> {
    const parts: StorageMultipartPart[] = [];
    let partNumberMarker: string | undefined;

    do {
      const page = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: upload.key,
          UploadId: upload.uploadId,
          PartNumberMarker: partNumberMarker,
        })
      );

      for (const part of page.Parts ?? []) {
        if (
          !(
            isSafeInteger(part.PartNumber) &&
            typeof part.ETag === 'string' &&
            isSafeInteger(part.Size)
          )
        ) {
          throw new StorageMultipartUploadError(
            'Multipart part listing returned incomplete part metadata'
          );
        }

        parts.push({
          partNumber: part.PartNumber,
          etag: part.ETag,
          sizeBytes: part.Size,
        });
      }

      if (!page.IsTruncated) {
        break;
      }

      if (
        !page.NextPartNumberMarker ||
        page.NextPartNumberMarker === partNumberMarker
      ) {
        throw new Error('Invalid multipart part pagination state');
      }

      partNumberMarker = page.NextPartNumberMarker;
    } while (partNumberMarker);

    return parts;
  }

  private async createMultipartPartPresignedUrl(
    upload: StorageMultipartUploadDescriptor,
    partNumber: number,
    options?: StorageMultipartPartUrlOptions
  ): Promise<StorageMultipartPartInstruction> {
    assertMultipartDescriptor(upload);

    if (!Number.isInteger(partNumber) || partNumber < 1) {
      throw new StorageMultipartUploadError(
        'Multipart partNumber must be a positive integer'
      );
    }

    if (partNumber > upload.partCount) {
      throw new StorageMultipartUploadError(
        'Multipart partNumber exceeds the declared partCount'
      );
    }

    const offsetBytes = (partNumber - 1) * upload.partSizeBytes;
    const remainingBytes = upload.expectedBytes - offsetBytes;
    const lengthBytes = Math.min(upload.partSizeBytes, remainingBytes);

    if (lengthBytes <= 0) {
      throw new StorageMultipartUploadError(
        'Multipart part range does not describe any bytes'
      );
    }

    const url = await getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        PartNumber: partNumber,
        ContentLength: lengthBytes,
      }),
      {
        expiresIn: this.multipartPresignedTtlSeconds,
        signableHeaders: new Set(['content-length']),
      }
    );

    const headers: Record<string, string> = {};

    if (options?.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    return {
      key: upload.key,
      uploadId: upload.uploadId,
      partNumber,
      method: 'PUT',
      url,
      headers,
      expiresAt: Date.now() + this.multipartPresignedTtlMs,
      offsetBytes,
      lengthBytes,
      maxBytes: lengthBytes,
    };
  }

  private async completeMultipartUpload<TMeta = never>(
    upload: StorageMultipartUploadDescriptor,
    options?: StorageMultipartCompleteOptions
  ): Promise<StorageObjectDescriptor<TMeta>> {
    await this.assertSingleWriteAttempt();
    assertMultipartDescriptor(upload);

    const parts = await this.listMultipartParts(upload);

    for (const [index, part] of parts.entries()) {
      const expectedPartNumber = index + 1;
      const expectedSize = Math.min(
        upload.partSizeBytes,
        upload.expectedBytes - (expectedPartNumber - 1) * upload.partSizeBytes
      );

      if (part.partNumber !== expectedPartNumber) {
        throw new StorageMultipartUploadError(
          'Multipart parts must be sequential and start at part 1'
        );
      }

      if (part.sizeBytes !== expectedSize) {
        throw new StorageMultipartUploadError(
          'Multipart part size does not match the declared byte layout'
        );
      }
    }

    if (parts.length !== upload.partCount) {
      throw new StorageMultipartUploadError(
        'Multipart upload is missing one or more declared parts'
      );
    }

    const response = await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
        },
      })
    );
    const object = await this.requireHeadObject<TMeta>(upload.key, {
      versionId: response.VersionId,
    });

    if (object.contentLength !== upload.expectedBytes) {
      throw new StorageMultipartUploadError(
        'Completed multipart object length does not match the declared byte layout'
      );
    }

    if (
      options?.contentType !== undefined &&
      object.contentType !== options.contentType
    ) {
      throw new StorageMultipartUploadError(
        'Completed multipart object content type does not match the requested content type'
      );
    }

    return object;
  }

  private async abortMultipartUpload(
    upload: StorageMultipartUploadSession
  ): Promise<void> {
    await this.assertSingleWriteAttempt();

    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: upload.key,
          UploadId: upload.uploadId,
        })
      );
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    try {
      const remaining = await this.listMultipartParts(upload);

      if (remaining.length > 0) {
        throw new StorageMultipartUploadError(
          'Multipart parts remain visible after abort'
        );
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private toObjectDescriptor<TMeta = never>(
    key: string,
    head: HeadObjectCommandOutput
  ): StorageObjectDescriptor<TMeta> {
    const contentLength = head.ContentLength ?? 0;
    const versionId = head.VersionId ?? null;

    if (!isSafeInteger(contentLength) || contentLength < 0) {
      throw new Error(
        `S3 object metadata is missing a safe ContentLength for ${key}`
      );
    }

    if (this.versioning === 'enabled' && !head.VersionId) {
      throw new Error('Versioned S3 storage did not return a version ID');
    }

    if (
      this.versioning === 'disabled' &&
      head.VersionId !== undefined &&
      head.VersionId !== 'null'
    ) {
      throw new Error(
        'S3 versioning configuration does not match bucket behavior'
      );
    }

    return {
      key,
      contentLength,
      contentType: head.ContentType,
      etag: head.ETag,
      versionId,
      checksum: toChecksum(head),
      lastModified: head.LastModified?.getTime(),
      meta: (head.Metadata ?? undefined) as TMeta,
    };
  }

  private resolveVersionId(
    ref: StorageObjectReference,
    options?: StorageReadObjectOptions
  ): string | undefined {
    const versionId = options?.versionId ?? ref.versionId ?? undefined;

    if (this.versioning === 'enabled' && !versionId) {
      throw new Error(
        'Versioned S3 storage requires a version ID for pinned reads'
      );
    }

    return versionId;
  }

  private async assertSingleWriteAttempt(): Promise<void> {
    const maxAttempts = await this.client.config.maxAttempts();

    if (maxAttempts !== 1) {
      throw new Error(
        'S3 multipart and immutable writes require client maxAttempts: 1'
      );
    }
  }

  private isBackblazeEndpoint(): boolean {
    return (
      typeof this.endpoint === 'string' && this.endpoint.includes('backblazeb2')
    );
  }
}
