/**
 * Example usage of the Promise Cache Service
 *
 * This file demonstrates various patterns for using the cache service.
 */

import { useEffect } from 'react';
import {
  type CacheableResult,
  PromiseCacheProvider,
  useCacheContext,
  useCachedPromise,
} from './index';

// ============================================================================
// Example 1: Basic Usage with useCachedPromise
// ============================================================================

type User = {
  id: string;
  name: string;
  email: string;
};

async function fetchUser(userId: string): Promise<User> {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error, execute } = useCachedPromise(
    `user-${userId}`,
    () => fetchUser(userId),
    { ttl: 5 * 60 * 1000 } // Cache for 5 minutes
  );

  useEffect(() => {
    execute();
  }, [execute]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  );
}

// ============================================================================
// Example 2: Using cachedPromise from context
// ============================================================================

function DataLoader() {
  const { cachedPromise } = useCacheContext();

  const loadData = async () => {
    await cachedPromise<{ items: string[] }>(
      'api-data',
      () => fetch('/api/data').then((r) => r.json()),
      { ttl: 60_000 }
    );
  };

  return (
    <button onClick={loadData} type='button'>
      Load Data
    </button>
  );
}

// ============================================================================
// Example 3: Manual Cache Operations
// ============================================================================

function CacheControls() {
  const cache = useCacheContext();

  const clearUserCache = () => {
    cache.delete('user-123');
  };

  const clearAllCache = () => {
    cache.clear();
  };

  const checkCache = () => {
    cache.has('user-123');
    cache.get<User>('user-123');
  };

  return (
    <div>
      <button onClick={clearUserCache} type='button'>
        Clear User
      </button>
      <button onClick={clearAllCache} type='button'>
        Clear All
      </button>
      <button onClick={checkCache} type='button'>
        Check Cache
      </button>
    </div>
  );
}

// ============================================================================
// Example 4: Stale-While-Revalidate Pattern
// ============================================================================

function DashboardData() {
  const { data, loading, execute } = useCachedPromise(
    'dashboard',
    async () => {
      const response = await fetch('/api/dashboard');
      return response.json();
    },
    {
      ttl: 5 * 60 * 1000,
      staleWhileRevalidate: true, // Show old data while fetching new
    }
  );

  useEffect(() => {
    execute();
  }, [execute]);

  return (
    <div>
      {loading && <div>Refreshing...</div>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

// ============================================================================
// Example 5: Using expiresAt from API Response
// ============================================================================

type SessionData = {
  token: string;
  userId: string;
};

async function fetchSession(): Promise<CacheableResult<SessionData>> {
  const response = await fetch('/api/session');
  const data = await response.json();

  // API returns expiresAt (in seconds or milliseconds - auto-detected)
  return {
    data: {
      token: data.token,
      userId: data.userId,
    },
    expiresAt: data.expiresAt, // Can be in seconds or ms
  };
}

function SessionManager() {
  const { data, loading, execute } = useCachedPromise<SessionData>(
    'session',
    fetchSession,
    {} // No TTL needed - expiresAt takes precedence
  );

  useEffect(() => {
    execute();
  }, [execute]);

  if (loading) return <div>Loading session...</div>;
  if (!data) return <div>No session</div>;

  return <div>User: {data.userId}</div>;
}

// ============================================================================
// Example 6: expiresAt with cachedPromise
// ============================================================================

function TokenRefresher() {
  const { cachedPromise } = useCacheContext();

  const refreshToken = async () => {
    await cachedPromise<{ token: string }>('auth-token', async () => {
      const response = await fetch('/api/token/refresh');
      const data = await response.json();

      // Return with expiresAt
      return {
        data: { token: data.token },
        expiresAt: data.expiresAt, // Auto-detects seconds vs milliseconds
      };
    });
  };

  return (
    <button onClick={refreshToken} type='button'>
      Refresh Token
    </button>
  );
}

// ============================================================================
// Example 7: Force Fresh Data
// ============================================================================

function LiveStats() {
  const { data, loading, execute } = useCachedPromise(
    'live-stats',
    async () => {
      const response = await fetch('/api/stats/live');
      return response.json();
    },
    {
      forceFresh: true, // Always fetch fresh, but still cache
      ttl: 10 * 1000,
    }
  );

  return (
    <div>
      <button onClick={execute} type='button'>
        Refresh Stats
      </button>
      {loading ? 'Loading...' : <div>{JSON.stringify(data)}</div>}
    </div>
  );
}

// ============================================================================
// Example 8: App Root with Provider
// ============================================================================

export function App() {
  return (
    <PromiseCacheProvider>
      <div>
        <h1>My App</h1>
        <UserProfile userId='123' />
        <DataLoader />
        <CacheControls />
        <DashboardData />
        <SessionManager />
        <TokenRefresher />
        <LiveStats />
      </div>
    </PromiseCacheProvider>
  );
}

// ============================================================================
// Example 9: Multiple Components Sharing Cache (Request Deduplication)
// ============================================================================

// Both components use the same cache key - only ONE request will be made
function UserAvatar({ userId }: { userId: string }) {
  const { data } = useCachedPromise(`user-${userId}`, () => fetchUser(userId), {
    ttl: 60_000,
  });

  return data ? (
    <img alt={data.name} height={48} src={`/avatars/${data.id}`} width={48} />
  ) : null;
}

function UserName({ userId }: { userId: string }) {
  const { data } = useCachedPromise(
    `user-${userId}`, // Same key as UserAvatar!
    () => fetchUser(userId),
    { ttl: 60_000 }
  );

  return <span>{data?.name}</span>;
}

// When both mount together, the cache layer deduplicates the request
export function UserCard({ userId }: { userId: string }) {
  return (
    <div>
      <UserAvatar userId={userId} />
      <UserName userId={userId} />
    </div>
  );
}
