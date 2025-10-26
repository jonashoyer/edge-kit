export function lazy<T extends Record<string, unknown>>(
  factories: { [K in keyof T]: () => T[K] }
): T {
  const cache: Partial<T> = {};
  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") {
        return undefined as unknown as T[keyof T];
      }
      const key = prop as keyof T;
      const existing = cache[key];
      if (existing !== undefined) return existing;
      const factory = factories[key];
      if (!factory) {
        throw new Error(`Unknown lazy key: ${String(prop)}`);
      }
      const instance = factory();
      cache[key] = instance;
      return instance;
    },
    has(_target, prop: string | symbol) {
      return typeof prop === "string" && (prop as keyof T) in factories;
    },
    ownKeys() {
      return Object.keys(factories);
    },
    getOwnPropertyDescriptor() {
      return { configurable: true, enumerable: true };
    },
  });
}
