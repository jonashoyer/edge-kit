/**
 * Utility for serializing Error objects into a plain object structure.
 * Useful for logging or sending error details over the network.
 */
export type SerializedErrorCause = {
  name?: string;
  message?: string;
  stack?: string;
  details?: Record<string, boolean | number | string | null>;
};

export type SerializeError = {
  name?: string;
  message?: string;
  stack?: string;
  code?: string | number;
  cause?: string;
  details?: Record<string, boolean | number | string | null>;
  causes?: SerializedErrorCause[];
};

const MAX_CAUSE_DEPTH = 5;
const MAX_DETAIL_COUNT = 20;
const MAX_DETAIL_LENGTH = 500;
const CORE_ERROR_PROPERTIES = new Set(['cause', 'message', 'name', 'stack']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stringValue = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

const serializeErrorDetails = (
  error: object
): Record<string, boolean | number | string | null> | undefined => {
  const details: Record<string, boolean | number | string | null> = {};
  const propertyNames = Object.getOwnPropertyNames(error)
    .filter((key) => !CORE_ERROR_PROPERTIES.has(key))
    .slice(0, MAX_DETAIL_COUNT);
  const errorMessage =
    error instanceof Error
      ? error.message
      : stringValue(Reflect.get(error, 'message'));

  for (const key of propertyNames) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (!(descriptor && 'value' in descriptor)) {
      details[key] = '[accessor omitted]';
      continue;
    }
    const { value } = descriptor;

    if (
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      value === null
    ) {
      details[key] = value;
    } else if (typeof value === 'string') {
      if (value.length >= 8 && errorMessage?.includes(value)) {
        continue;
      }
      details[key] =
        value.length > MAX_DETAIL_LENGTH
          ? `${value.slice(0, MAX_DETAIL_LENGTH)}...`
          : value;
    } else if (typeof value === 'bigint') {
      details[key] = value.toString();
    }
  }

  return Object.keys(details).length > 0 ? details : undefined;
};

const serializeErrorCauses = (error: Error): SerializedErrorCause[] => {
  const causes: SerializedErrorCause[] = [];
  const seen = new Set<unknown>([error]);
  let current: unknown = error.cause;

  while (current !== undefined && causes.length < MAX_CAUSE_DEPTH) {
    if (seen.has(current)) {
      causes.push({ message: '[circular error cause]' });
      break;
    }
    seen.add(current);

    if (current instanceof Error) {
      causes.push({
        details: serializeErrorDetails(current),
        message: current.message,
        name: current.name,
        stack: current.stack,
      });
      current = current.cause;
      continue;
    }

    if (typeof current === 'string') {
      causes.push({ message: current });
    } else if (isRecord(current)) {
      causes.push({
        details: serializeErrorDetails(current),
        message: stringValue(current.message) ?? '[non-error object cause]',
        name: stringValue(current.name),
      });
    } else {
      causes.push({ message: String(current) });
    }
    break;
  }

  if (current !== undefined && causes.length === MAX_CAUSE_DEPTH) {
    causes.push({ message: '[error cause chain truncated]' });
  }

  return causes;
};

export function serializeError(err: unknown): SerializeError {
  if (err instanceof Error) {
    const anyErr = err as Error & { code?: unknown; cause?: unknown };
    const code =
      typeof anyErr.code === 'string' || typeof anyErr.code === 'number'
        ? anyErr.code
        : undefined;
    const causeVal = anyErr.cause;
    let cause: string | undefined;
    if (causeVal instanceof Error) {
      cause = causeVal.message;
    } else if (typeof causeVal === 'string') {
      cause = causeVal;
    }

    return {
      cause,
      causes: serializeErrorCauses(err),
      code,
      details: serializeErrorDetails(err),
      message: err.message,
      name: err.name,
      stack: err.stack ?? undefined,
    };
  }

  if (
    typeof err === 'string' ||
    typeof err === 'number' ||
    typeof err === 'boolean' ||
    err === null ||
    err === undefined
  ) {
    return { message: String(err) };
  }

  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: '[unserializable error]' };
  }
}
