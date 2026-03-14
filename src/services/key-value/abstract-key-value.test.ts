import { describe, expect, it } from 'vitest';

import { InMemoryKeyValueService } from './in-memory-key-value';
import { AbstractKeyValueService } from './abstract-key-value';

describe('AbstractKeyValueService.withCache', () => {
  it('stores cached values with a TTL and reuses them before expiry', async () => {
    const kv = new InMemoryKeyValueService();
    let calls = 0;

    const first = await kv.withCache(
      'cache:key',
      async () => {
        calls += 1;
        return 'value';
      },
      { ttlSeconds: 1 }
    );

    const second = await kv.withCache('cache:key', async () => {
      calls += 1;
      return 'next-value';
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const third = await kv.withCache('cache:key', async () => {
      calls += 1;
      return 'refreshed-value';
    });

    expect(first).toBe('value');
    expect(second).toBe('value');
    expect(third).toBe('refreshed-value');
    expect(calls).toBe(2);
  });

  it('respects bypassCache', async () => {
    const kv = new InMemoryKeyValueService();
    let calls = 0;

    await kv.withCache('cache:key', async () => {
      calls += 1;
      return 'value';
    });

    const bypassed = await kv.withCache(
      'cache:key',
      async () => {
        calls += 1;
        return 'fresh-value';
      },
      { bypassCache: true }
    );

    expect(bypassed).toBe('fresh-value');
    expect(calls).toBe(2);
  });

  it('noopWithCache only executes the callback', async () => {
    let calls = 0;

    const result = await AbstractKeyValueService.noopWithCache(
      'unused',
      async () => {
        calls += 1;
        return 'value';
      },
      { ttlSeconds: 10, bypassCache: true }
    );

    expect(result).toBe('value');
    expect(calls).toBe(1);
  });
});
