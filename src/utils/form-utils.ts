import { z } from 'zod';

/**
 * Utilities for handling FormData and File validation with Zod.
 * Includes helpers for parsing FormData into objects and validating File constraints (size, type).
 */
export const zfd =
  <T extends z.ZodObject<z.ZodRawShape>>(schema: T) =>
  (value: unknown) => {
    if (!(value instanceof FormData)) {
      throw new Error('Expected FormData');
    }

    const obj: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

    for (const [key, val] of value.entries()) {
      if (key.endsWith('[]')) {
        const k = key.slice(0, -2);
        const entries = obj[k];
        if (entries === undefined || entries === '') {
          obj[k] = [val];
        } else if (Array.isArray(entries)) {
          entries.push(val);
        } else {
          throw new Error(`Cannot mix scalar and array fields: ${k}`);
        }
      } else {
        obj[key] = val;
      }
    }

    return schema.parse(obj) as z.infer<T>;
  };

export interface ZFileOptions {
  /**
   * Accepted mime types
   *
   * @example ["image/png", "image/jpg", "image/jpeg"]
   */
  acceptedTypes?: string[];
  /**
   * Maximum file size in MB
   */
  maxSize?: number;
}

export const zFile = (opts?: ZFileOptions) =>
  z
    .instanceof(File)
    .refine(
      (file) => !opts?.maxSize || sizeInMB(file.size) <= opts.maxSize,
      `The maximum size is ${opts?.maxSize ?? 'N/A'}MB`
    )
    .superRefine((file: File, ctx) => {
      if (opts?.acceptedTypes && !opts.acceptedTypes.includes(file.type)) {
        ctx.addIssue({
          code: 'custom',
          message: `File type is not supported (${file.type})`,
        });
      }
    });

const sizeInMB = (sizeInBytes: number) => sizeInBytes / (1024 * 1024);
