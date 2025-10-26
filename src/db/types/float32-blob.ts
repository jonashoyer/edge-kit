import { customType } from "drizzle-orm/sqlite-core";

/**
 * Creates a Drizzle customType for storing Float32Array embeddings as BLOB in SQLite.
 *
 * @param dim - The expected dimension of the embedding vectors
 * @returns A customType that handles Float32Array <-> BLOB conversion
 *
 * @example
 * ```ts
 * import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
 * import { float32Blob } from './types/float32-blob'
 *
 * const embeddings = sqliteTable('embeddings', {
 *   id: text('id').primaryKey(),
 *   embedding: float32Blob(1536)('embedding'),
 * })
 * ```
 */
export const float32Blob = (dim: number) =>
  customType<{ data: Float32Array; driverData: Buffer | Uint8Array }>({
    dataType() {
      return "blob";
    },
    toDriver(inputValue: Float32Array) {
      let value = inputValue;
      if (!(value instanceof Float32Array)) {
        // Allow number[] at call-site for convenience
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        value = new Float32Array(value as unknown as number[]);
      }

      if (value.length !== dim) {
        throw new Error(
          `Embedding dimension mismatch: expected ${dim}, got ${value.length}`
        );
      }

      // Convert Float32Array to Buffer without copying the underlying ArrayBuffer
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    },
    fromDriver(value: Buffer | Uint8Array) {
      const buf = value instanceof Buffer ? value : Buffer.from(value);

      if (buf.byteLength % 4 !== 0) {
        throw new Error(
          `Invalid Float32 BLOB size: ${buf.byteLength} bytes (must be multiple of 4)`
        );
      }

      // Create Float32Array view over the buffer
      const arr = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength / 4
      );

      if (arr.length !== dim) {
        // Log warning but don't throw - allows for dimension evolution
        // eslint-disable-next-line no-console
        console.warn(
          `Float32 BLOB dimension mismatch: expected ${dim}, got ${arr.length}`
        );
      }

      // Return a fresh copy to avoid sharing the underlying buffer memory
      return new Float32Array(arr);
    },
  });
