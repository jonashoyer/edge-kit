type Result<T, E = Error> = { data: T; error: null } | { data: null; error: E };

/**
 * Utility for handling Promise results safely.
 * Wraps a Promise to return a discriminated union of `{ data, error }`.
 * Eliminates the need for try-catch blocks in async flows.
 */
export async function tryCatch<T, E = Error>(promise: Promise<T> | T): Promise<Result<T, E>> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}
