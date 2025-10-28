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
      typeof anyErr.code === "string" || typeof anyErr.code === "number"
        ? anyErr.code
        : undefined;
    const causeVal = anyErr.cause;
    let cause: string | undefined;
    if (causeVal instanceof Error) {
      cause = causeVal.message;
    } else if (typeof causeVal === "string") {
      cause = causeVal;
    }

    return {
      name: err.name,
      message: err.message,
      stack: err.stack ?? undefined,
      code,
      cause,
    };
  }

  if (
    typeof err === "string" ||
    typeof err === "number" ||
    typeof err === "boolean" ||
    err == null
  ) {
    return { message: String(err) };
  }

  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: "[unserializable error]" };
  }
}
