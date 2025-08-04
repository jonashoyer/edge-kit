import { z } from 'zod';

export const zfd = <T extends z.ZodObject<any>>(schema: T) => {
  return (value: unknown) => {
    if (!(value instanceof FormData)) {
      throw new Error('Expected FormData');
    }

    const obj = {} as any;

    for (const [key, val] of (value as any).entries()) {
      if (key.endsWith('[]')) {
        const k = key.slice(0, -2);
        if (!obj[k]) {
          obj[k] = [];
        }
        obj[k].push(val);
      } else {
        obj[key] = val;
      }
    }

    return schema.parse(obj) as z.infer<T>;
  };
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
      (file) => {
        return !opts?.maxSize || sizeInMB(file.size) <= opts.maxSize;
      },
      `The maximum size is ${opts?.maxSize ?? 'N/A'}MB`,
    )
    .refine(
      (file) => {
        return !opts?.acceptedTypes || opts.acceptedTypes.includes(file.type);
      },
      (file) => ({ message: `File type is not supported (${file.type})` }),
    );

const sizeInMB = (sizeInBytes: number) => {
  return sizeInBytes / (1024 * 1024);
};
