export function lazy<T extends Record<string, unknown>>(
  factories: { [K in keyof T]: T[K] | ((self: T) => T[K]) }
): T {
  const cache: Partial<T> = {};
  return new Proxy({} as T, {
    get(_target, prop: string | symbol, receiver: T) {
      if (typeof prop !== 'string') {
        return undefined as unknown as T[keyof T];
      }
      const key = prop as keyof T;
      const existing = cache[key];
      if (existing !== undefined) return existing;
      const candidate = factories[key];
      if (candidate === undefined) {
        throw new Error(`Unknown lazy key: ${String(prop)}`);
      }
      const instance =
        typeof candidate === 'function'
          ? (candidate as (self: T) => T[keyof T])(receiver)
          : (candidate as T[keyof T]);
      cache[key] = instance;
      return instance;
    },
    has(_target, prop: string | symbol) {
      return typeof prop === 'string' && (prop as keyof T) in factories;
    },
    ownKeys() {
      return Object.keys(factories);
    },
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return;
      if (!((prop as keyof T) in factories)) return;
      return { configurable: true, enumerable: true };
    },
  });
}

/*
Example usage:

interface Services {
  // user: UserService;
  // search: SearchService;
}

// const services = lazy<Services>({
//   // Lazy (factory): constructed on first access
//   user: () => new UserService(db),
//
//   // Eager (value): provided directly, no factory call
//   search: new SearchService(),
// });
*/
