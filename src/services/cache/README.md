# Promise Cache Service

A React context-based caching layer that wraps async promise functions with automatic caching, expiration management, and request deduplication.

## Features

- ✅ **Automatic Caching**: Cache promise results with a unique key
- ⏰ **Expiration Management**: Set TTL (time-to-live) for cached values
- 🔄 **Request Deduplication**: Prevent multiple concurrent requests for the same key
- 🔁 **Stale-While-Revalidate**: Return stale data while fetching fresh data in background
- 🎯 **Type-Safe**: Full TypeScript support with generics
- 🪝 **React Hooks**: Easy-to-use hooks for React components

## Installation

```tsx
import { PromiseCacheProvider } from "@/services/cache";

function App() {
  return (
    <PromiseCacheProvider>
      <YourApp />
    </PromiseCacheProvider>
  );
}
```

## Basic Usage

### `useCachedPromise` Hook

The main hook for caching async operations with state management:

```tsx
import { useCachedPromise } from "@/services/cache";

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error, execute } = useCachedPromise(
    `user-${userId}`,
    () => fetchUserProfile(userId),
    { ttl: 5 * 60 * 1000 } // Cache for 5 minutes
  );

  useEffect(() => {
    execute();
  }, [execute]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  return <div>{data.name}</div>;
}
```

### Manual Cache Operations

Use `useCacheContext` for direct cache manipulation:

```tsx
import { useCacheContext } from "@/services/cache";

function CacheManager() {
  const cache = useCacheContext();

  const handleClear = () => {
    cache.clear(); // Clear all cache
  };

  const handleDelete = () => {
    cache.delete("specific-key"); // Delete specific entry
  };

  const handleManualSet = () => {
    cache.set("custom-key", { data: "value" }, 30000); // Cache for 30s
  };

  const checkCache = () => {
    const hasData = cache.has("specific-key");
    const data = cache.get("specific-key");
    console.log({ hasData, data });
  };

  return (
    <div>
      <button onClick={handleClear}>Clear All</button>
      <button onClick={handleDelete}>Delete Key</button>
      <button onClick={handleManualSet}>Set Custom</button>
      <button onClick={checkCache}>Check Cache</button>
    </div>
  );
}
```

## Advanced Patterns

### Stale-While-Revalidate

Return cached data immediately while fetching fresh data in the background:

```tsx
const { data, loading, error, execute } = useCachedPromise(
  "dashboard-data",
  () => fetchDashboardData(),
  {
    ttl: 5 * 60 * 1000,
    staleWhileRevalidate: true, // Return stale data while revalidating
  }
);
```

### Force Fresh Data

Bypass cache and always fetch fresh data:

```tsx
const { data, loading, error, execute } = useCachedPromise(
  "live-data",
  () => fetchLiveData(),
  {
    forceFresh: true, // Always fetch, but still cache the result
  }
);
```

### Dynamic Cache Keys

Create cache keys based on parameters:

```tsx
function ProductDetails({ productId, locale }: Props) {
  const cacheKey = `product-${productId}-${locale}`;

  const { data, loading, error, execute } = useCachedPromise(
    cacheKey,
    () => fetchProduct(productId, locale),
    { ttl: 10 * 60 * 1000 }
  );

  // ...
}
```

### Infinite Cache (No Expiration)

Omit the `ttl` option to cache indefinitely:

```tsx
const { data, loading, error, execute } = useCachedPromise(
  "static-config",
  () => fetchAppConfig(),
  {} // No ttl = never expires
);
```

### Prefetching Data

Prefetch data before it's needed:

```tsx
function DataPrefetcher() {
  const cachedFetch = useCacheWrapper("user-list", { ttl: 300000 });

  useEffect(() => {
    // Prefetch data on mount
    cachedFetch(() => fetchUserList());
  }, [cachedFetch]);

  return null;
}
```

### Cache Invalidation on Mutation

Invalidate cache after data changes:

```tsx
function UserEditor({ userId }: { userId: string }) {
  const cache = useCacheContext();

  const { data, execute } = useCachedPromise(
    `user-${userId}`,
    () => fetchUser(userId),
    { ttl: 60000 }
  );

  const updateUser = async (updates: UserUpdates) => {
    await saveUser(userId, updates);

    // Invalidate cache to force fresh data
    cache.delete(`user-${userId}`);

    // Refetch
    await execute();
  };

  // ...
}
```

### Shared Cache Across Components

Multiple components can share the same cache key:

```tsx
// Component A
function UserAvatar({ userId }: { userId: string }) {
  const { data } = useCachedPromise(`user-${userId}`, () => fetchUser(userId), {
    ttl: 60000,
  });

  return <img src={data?.avatar} alt={data?.name} />;
}

// Component B (uses same cache key!)
function UserName({ userId }: { userId: string }) {
  const { data } = useCachedPromise(`user-${userId}`, () => fetchUser(userId), {
    ttl: 60000,
  });

  return <span>{data?.name}</span>;
}

// If both components mount, only ONE request is made (deduplication)
// Both components receive the same cached data
```

## API Reference

### `PromiseCacheProvider`

React context provider that manages cache state.

```tsx
type PromiseCacheProviderProps = {
  children: ReactNode;
};
```

### `useCachedPromise<T>`

Hook that wraps a promise function with caching, state management, and error handling.

```tsx
function useCachedPromise<T>(
  key: string,
  promiseFn: () => Promise<T>,
  options?: CacheOptions
): {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  execute: () => Promise<T>;
};
```

**Parameters:**

- `key`: Unique cache identifier
- `promiseFn`: Async function to cache
- `options`: Caching options (ttl, forceFresh, staleWhileRevalidate)

**Returns:**

- `data`: Cached or fetched data
- `loading`: Loading state
- `error`: Error if promise rejected
- `execute`: Function to trigger the promise execution

### `useCacheContext`

Hook to access cache operations directly.

```tsx
function useCacheContext(): {
  get: <T>(key: string) => T | undefined;
  set: <T>(key: string, value: T, ttl?: number) => void;
  delete: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
};
```

### `CacheOptions`

```tsx
type CacheOptions = {
  ttl?: number; // Time-to-live in milliseconds
  forceFresh?: boolean; // Always fetch fresh data
  staleWhileRevalidate?: boolean; // Return stale data while revalidating
};
```

## Best Practices

1. **Use Descriptive Keys**: Make cache keys descriptive and unique

   ```tsx
   // Good
   `user-${userId}-profile``post-${postId}-comments-${page}`
   // Bad
   `data``cache1`;
   ```

2. **Set Appropriate TTLs**: Consider data freshness requirements

   ```tsx
   // Static config: long TTL or infinite
   { ttl: 24 * 60 * 60 * 1000 } // 24 hours

   // User data: moderate TTL
   { ttl: 5 * 60 * 1000 } // 5 minutes

   // Real-time data: short TTL or forceFresh
   { ttl: 10 * 1000, forceFresh: true }
   ```

3. **Handle Loading States**: Always handle loading and error states

   ```tsx
   if (loading) return <Skeleton />;
   if (error) return <ErrorMessage error={error} />;
   if (!data) return null;
   ```

4. **Invalidate on Mutations**: Clear cache when data changes

   ```tsx
   const updateData = async () => {
     await mutateData();
     cache.delete(cacheKey);
     await execute(); // Refetch
   };
   ```

5. **Use Request Deduplication**: Let the cache handle concurrent requests automatically
   ```tsx
   // Multiple components with same key = single request
   // No extra configuration needed!
   ```

## Performance Considerations

- Cache is stored in-memory (ref) and doesn't cause re-renders
- Expired entries are lazily removed on access
- Pending requests are automatically deduplicated
- Unmounted components don't update state (memory safe)

## Limitations

- Cache is cleared on page refresh (in-memory only)
- No persistence to localStorage or sessionStorage
- No automatic revalidation intervals (manual only)
- No cache size limits (grows unbounded)

To implement persistence or size limits, extend the `PromiseCacheProvider` component.
