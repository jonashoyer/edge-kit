export type ErrorDiagnosticValue =
  | boolean
  | number
  | string
  | null
  | ErrorDiagnosticValue[]
  | { [key: string]: ErrorDiagnosticValue };

const SENSITIVE_KEY =
  /authorization|cookie|password|secret|token|api[-_]?key|headers|body|payload|^request$|^config$|^params$|^data$|^url$|^sdp$/i;

const MAX_DEPTH = 10;
const MAX_ITEMS = 50;
const MAX_NODES = 200;
const MAX_STRING_LENGTH = 2000;
const MAX_SERIALIZED_LENGTH = 32_768;

const truncate = (value: string): string =>
  value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}[truncated]`
    : value;

const serializePrimitive = (current: unknown): ErrorDiagnosticValue => {
  if (typeof current === 'string') {
    return truncate(current);
  }
  if (current === null || typeof current === 'boolean') {
    return current;
  }
  if (typeof current === 'number') {
    return Number.isFinite(current) ? current : String(current);
  }
  return truncate(String(current));
};

/**
 * Serialize an arbitrary error or diagnostic value into a bounded, JSON-safe
 * graph while redacting credential and payload fields.
 *
 * Designed for safely persisting provider or runtime error objects without
 * executing getters, leaking tokens/headers/bodies, or exceeding storage limits.
 */
export function serializeErrorDiagnostics(
  value: unknown
): ErrorDiagnosticValue {
  const ancestors = new Set<object>();
  let remaining = MAX_NODES;

  const serializePropertyValue = (
    key: PropertyKey,
    descriptor: PropertyDescriptor | undefined,
    depth: number
  ): ErrorDiagnosticValue => {
    if (SENSITIVE_KEY.test(String(key))) {
      return '[redacted]';
    }
    if (descriptor && 'value' in descriptor) {
      return visit(descriptor.value, depth + 1);
    }
    return '[accessor not evaluated]';
  };

  const visitMapEntry = (
    entryKey: unknown,
    entryValue: unknown,
    depth: number
  ): ErrorDiagnosticValue => [
    visit(entryKey, depth + 1),
    typeof entryKey === 'string' && SENSITIVE_KEY.test(entryKey)
      ? '[redacted]'
      : visit(entryValue, depth + 1),
  ];

  const visitCollection = (
    current: Map<unknown, unknown> | Set<unknown> | unknown[],
    depth: number
  ): ErrorDiagnosticValue[] => {
    const values: ErrorDiagnosticValue[] = [];
    for (const entry of current) {
      if (values.length >= MAX_ITEMS || remaining <= 0) {
        values.push('[truncated]');
        break;
      }
      if (current instanceof Map) {
        const [entryKey, entryValue] = entry as [unknown, unknown];
        values.push(visitMapEntry(entryKey, entryValue, depth));
      } else {
        values.push(visit(entry, depth + 1));
      }
    }
    return values;
  };

  const visitRecord = (
    current: object,
    depth: number
  ): Record<string, ErrorDiagnosticValue> => {
    const entries: [string, ErrorDiagnosticValue][] = [];
    // V8 exposes stack as a lazy accessor. Read standard Error fields explicitly.
    const errorFields =
      current instanceof Error ? ['name', 'message', 'stack'] : [];
    for (const key of errorFields) {
      try {
        entries.push([key, visit(Reflect.get(current, key), depth + 1)]);
      } catch {
        entries.push([key, '[property could not be read]']);
      }
    }
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key === 'string' && errorFields.includes(key)) {
        continue;
      }
      if (entries.length >= MAX_ITEMS || remaining <= 0) {
        entries.push(['[truncated]', '[truncated]']);
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      entries.push([
        truncate(String(key)),
        serializePropertyValue(key, descriptor, depth),
      ]);
    }
    return Object.fromEntries(entries);
  };

  const visitObject = (
    current: object,
    depth: number
  ): ErrorDiagnosticValue => {
    if (current instanceof Date) {
      return Number.isNaN(current.getTime())
        ? 'Invalid Date'
        : current.toISOString();
    }
    if (
      current instanceof Map ||
      current instanceof Set ||
      Array.isArray(current)
    ) {
      return visitCollection(current, depth);
    }
    return visitRecord(current, depth);
  };

  const visit = (current: unknown, depth = 0): ErrorDiagnosticValue => {
    if (remaining <= 0 || depth >= MAX_DEPTH) {
      return '[truncated]';
    }
    remaining -= 1;

    if (current === null || typeof current !== 'object') {
      return serializePrimitive(current);
    }
    if (ancestors.has(current)) {
      return '[circular reference]';
    }

    ancestors.add(current);
    try {
      return visitObject(current, depth);
    } finally {
      ancestors.delete(current);
    }
  };

  const result = visit(value);
  return JSON.stringify(result).length <= MAX_SERIALIZED_LENGTH
    ? result
    : '[truncated]';
}
