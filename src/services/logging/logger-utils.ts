import type { AbstractLogger, LoggablePrimitive } from './abstract-logger';

export type SerializedLogMetadata = Exclude<
  ReturnType<typeof AbstractLogger.serializeLogMetadata>,
  undefined
>;

const isLoggablePrimitive = (value: unknown): value is LoggablePrimitive =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value === null;

const coercePrimitive = (value: unknown): LoggablePrimitive => {
  if (isLoggablePrimitive(value)) {
    return value;
  }

  return String(value);
};

const coerceMetadataValue = (
  value: unknown
): LoggablePrimitive | Record<string, LoggablePrimitive> => {
  if (isLoggablePrimitive(value)) {
    return value;
  }

  if (typeof value === 'object' && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        coercePrimitive(nestedValue),
      ])
    );
  }

  return String(value);
};

export const normalizeOutputMetadata = (
  metadata?: SerializedLogMetadata
): SerializedLogMetadata | undefined => {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      coerceMetadataValue(value),
    ])
  );
};

export const safeJsonStringify = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === 'string') {
      return serialized;
    }
  } catch (error) {
    try {
      return JSON.stringify({
        fallback: String(value),
        serializationError:
          error instanceof Error ? error.message : String(error),
      });
    } catch {
      return '{"serializationError":"Unable to serialize payload"}';
    }
  }

  return '{"serializationError":"Unable to serialize payload"}';
};

export const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }

  return new Error(String(value));
};
