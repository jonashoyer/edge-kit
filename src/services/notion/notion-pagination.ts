import { NotionError } from './notion-errors';

/** Checks only the envelope and fields needed by our readers, not every SDK field. */
export function validateNotionList<T>(
  response: unknown,
  isResult: (value: unknown) => value is T
): { results: T[]; has_more: boolean; next_cursor: string | null } {
  if (
    !isRecord(response) ||
    response.object !== 'list' ||
    typeof response.has_more !== 'boolean' ||
    !Array.isArray(response.results) ||
    !(
      response.next_cursor === null || isNonemptyString(response.next_cursor)
    ) ||
    (response.has_more
      ? !response.next_cursor
      : response.next_cursor !== null) ||
    !response.results.every(isResult)
  ) {
    throw new NotionError(
      'Invalid Notion list response or invalid result',
      'invalid_response'
    );
  }
  return {
    has_more: response.has_more,
    next_cursor: response.next_cursor,
    results: response.results,
  };
}

/** Iterates validated list pages without retaining previously yielded results. */
export async function* iterateNotionList<T>(
  fetchPage: (cursor: string | null) => Promise<unknown>,
  isResult: (value: unknown) => value is T,
  startCursor: string | null = null
): AsyncGenerator<T[]> {
  const seen = new Set<string>();
  let cursor = startCursor;
  // biome-ignore lint/suspicious/noUnnecessaryConditions: Pagination exits after inspecting each response cursor, not before requesting the first page.
  while (true) {
    if (cursor) {
      if (seen.has(cursor)) {
        throw new NotionError(
          'Repeated cursor in Notion response',
          'repeated_cursor'
        );
      }
      seen.add(cursor);
    }
    // biome-ignore lint/performance/noAwaitInLoops: The next page depends on this response cursor.
    const page = validateNotionList(await fetchPage(cursor), isResult);
    // Reject before yielding duplicated results from a non-advancing page.
    if (page.next_cursor && seen.has(page.next_cursor)) {
      throw new NotionError(
        'Repeated cursor in Notion response',
        'repeated_cursor'
      );
    }
    yield page.results;
    if (!page.has_more) return;
    cursor = page.next_cursor;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
