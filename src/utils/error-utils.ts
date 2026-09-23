/**
 * Utility for serializing Error objects into a plain object structure.
 * Useful for logging or sending error details over the network.
 */
export type SerializeError = {
  name?: string;
  message?: string;
  stack?: string;
  code?: string | number;
  cause?: string;
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
      code,
      message: err.message,
      name: err.name,
      stack: err.stack ?? undefined,
    };
  }

  if (
    typeof err === 'string' ||
    typeof err === 'number' ||
    typeof err === 'boolean' ||
    err === null
  ) {
    return { message: String(err) };
  }

  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: '[unserializable error]' };
  }
}
