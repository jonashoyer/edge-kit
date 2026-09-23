export type RecursivelySorted<T> = T extends (infer U)[]
  ? RecursivelySorted<U>[]
  : T extends object
    ? { [K in keyof T]: RecursivelySorted<T[K]> }
    : T;

export const recursivelySortObject = <T>(obj: T): RecursivelySorted<T> => {
  // Return early for primitives and null
  if (obj === null || typeof obj !== 'object') {
    return obj as RecursivelySorted<T>;
  }

  // Handle arrays by sorting each element recursively
  if (Array.isArray(obj)) {
    // Typescript cannot infer that the mapped result has the same shape, so we cast
    return obj.map(recursivelySortObject) as unknown as RecursivelySorted<T>;
  }

  // Handle plain objects: sort keys alphabetically and recurse on each value
  const sortedObject = Object.assign(
    {},
    ...Object.entries(obj as Record<string, unknown>)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => ({ [key]: recursivelySortObject(value) }))
  );

  return sortedObject as RecursivelySorted<T>;
};

export const stableStringify = (obj: unknown) =>
  JSON.stringify(recursivelySortObject(obj));

// Why preserve key order?
// Some LLM-based workflows rely on a deterministic property sequence within schema objects. By recording the current key order in a dedicated `__keys` field we can later restore that sequence after JSON round-trips or other transformations, guaranteeing stable and predictable output.

/**
 * Captures the current property order of the given object by attaching a `__keys` array.
 *
 * Note: This function mutates the original object. Clone the object beforehand if immutability is required.
 *
 * @template T extends Record<string, unknown>
 * @param obj - The object whose key order should be preserved.
 * @returns The same object instance augmented with a `__keys` metadata property.
 */
export const serializeObjectKeys = <T extends Record<string, unknown>>(
  obj: T
): T & { __keys: string[] } => Object.assign(obj, { __keys: Object.keys(obj) });

/**
 * Restores the original property order of an object that has previously been processed by
 * `serializeObjectKeys` and removes the helper `__keys` metadata afterwards.
 *
 * If no `__keys` array is present the object is returned unchanged.
 *
 * When metadata is present, this returns a new object without modifying the input.
 *
 * @template T extends Record<string, unknown>
 * @param obj - The object potentially containing a `__keys` metadata property.
 * @returns The object with properties reordered and `__keys` removed.
 */
export const deserializeObjectKeys = (
  obj: Record<string, unknown> & { __keys?: string[] },
  _keys?: string[]
) => {
  const keys = _keys ?? obj.__keys;
  if (!keys) return obj;

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => key !== '__keys')
      .sort(([keyA], [keyB]) => keys.indexOf(keyA) - keys.indexOf(keyB))
  );
};
