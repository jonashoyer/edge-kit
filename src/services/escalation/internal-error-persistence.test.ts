import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import {
  getInternalErrorHash,
  getInternalErrorPagePath,
  getPublicInternalErrorMessage,
  INTERNAL_ERROR_TTL_SECONDS,
  InternalErrorPersistenceService,
  type StoredInternalErrorActorRecord,
  type StoredInternalErrorRecord,
} from './internal-error-persistence';

class SortedSetKeyValueService extends InMemoryKeyValueService {
  private readonly sortedSets = new Map<string, Map<string, number>>();
  readonly ttls = new Map<string, number>();

  override async set<T>(key: string, value: T, ttlSeconds?: number) {
    await super.set(key, value, ttlSeconds);
    if (ttlSeconds !== undefined) {
      this.ttls.set(key, ttlSeconds);
    }
  }

  override async zadd(key: string, score: number, member: string) {
    const sortedSet = this.sortedSets.get(key) ?? new Map<string, number>();
    sortedSet.set(member, score);
    this.sortedSets.set(key, sortedSet);
  }

  override async zrange(key: string, start: number, stop: number) {
    const entries = [...(this.sortedSets.get(key)?.entries() ?? [])];
    return entries
      .sort(
        (left, right) => left[1] - right[1] || left[0].localeCompare(right[0])
      )
      .map(([member]) => member)
      .slice(start, stop + 1);
  }

  override async expire(key: string, ttlSeconds: number) {
    if (this.sortedSets.has(key)) {
      this.ttls.set(key, ttlSeconds);
      return true;
    }
    const updated = await super.expire(key, ttlSeconds);
    if (updated) {
      this.ttls.set(key, ttlSeconds);
    }
    return updated;
  }
}

const createInternalError = () => {
  const error = new Error('boom');
  error.name = 'SyntheticFailure';
  error.stack = 'RAW_STACK_CONTEXT';
  return Object.assign(error, {
    apiKey: 'secret-token',
    code: 'INTERNAL_SERVER_ERROR',
    requestId: 'req-123',
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe('InternalErrorPersistenceService', () => {
  it('persists aggregate redacted diagnostics and per-actor records with sliding TTLs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    const kv = new SortedSetKeyValueService();
    const service = new InternalErrorPersistenceService(kv);
    const input = {
      actor: { impersonatedBy: 'admin-2', userId: 'user-1' },
      error: createInternalError(),
      pagePath: '/assignments/123',
      path: 'report.build',
    };

    const firstResult = await service.persist(input);
    await vi.advanceTimersByTimeAsync(1000);
    const secondResult = await service.persist(input);

    const hash = getInternalErrorHash('boom');
    const record = await kv.get<StoredInternalErrorRecord>(
      `internal-error:${hash}`
    );
    const actor = await kv.get<StoredInternalErrorActorRecord>(
      `internal-error:${hash}:actor:user-1`
    );

    expect(firstResult).toEqual(secondResult);
    expect(record).toMatchObject({
      count: 2,
      diagnostics: {
        apiKey: '[redacted]',
        code: 'INTERNAL_SERVER_ERROR',
        message: 'boom',
        name: 'SyntheticFailure',
        requestId: 'req-123',
      },
      errorMessage: 'boom',
      errorName: 'SyntheticFailure',
      hash,
      path: 'report.build',
      stack: 'RAW_STACK_CONTEXT',
    });
    expect(JSON.stringify(record?.diagnostics)).not.toContain('secret-token');
    expect(record?.firstSeenAt).toBe('2026-08-14T12:00:00.000Z');
    expect(record?.lastSeenAt).toBe('2026-08-14T12:00:01.000Z');
    expect(actor).toMatchObject({
      count: 2,
      hash,
      impersonatedBy: 'admin-2',
      pagePath: '/assignments/123',
      userId: 'user-1',
    });
    expect(await kv.zrange(`internal-error:${hash}:actor-index`, 0, 9)).toEqual(
      ['user-1']
    );
    expect(firstResult?.recordKey).toBe(`internal-error:${hash}`);
    expect(kv.ttls.get(`internal-error:${hash}`)).toBe(
      INTERNAL_ERROR_TTL_SECONDS
    );
    expect(kv.ttls.get(`internal-error:${hash}:actor:user-1`)).toBe(
      INTERNAL_ERROR_TTL_SECONDS
    );
    expect(kv.ttls.get(`internal-error:${hash}:actor-index`)).toBe(
      INTERNAL_ERROR_TTL_SECONDS
    );
  });

  it('keeps each actor’s latest pagePath and clears stale context when null', async () => {
    const kv = new SortedSetKeyValueService();
    const service = new InternalErrorPersistenceService(kv);
    const error = createInternalError();
    const hash = getInternalErrorHash(error.message);
    const actorKey = `internal-error:${hash}:actor:user-1`;

    await service.persist({
      actor: { userId: 'user-1' },
      error,
      pagePath: '/assignments/first',
    });
    expect(
      await kv.get<StoredInternalErrorActorRecord>(actorKey)
    ).toMatchObject({ pagePath: '/assignments/first' });

    await service.persist({
      actor: { userId: 'user-1' },
      error,
      pagePath: '/assignments/second',
    });
    expect(
      await kv.get<StoredInternalErrorActorRecord>(actorKey)
    ).toMatchObject({ pagePath: '/assignments/second' });

    await service.persist({
      actor: { userId: 'user-1' },
      error,
      pagePath: null,
    });
    expect(
      await kv.get<StoredInternalErrorActorRecord>(actorKey)
    ).toMatchObject({ pagePath: null });
  });

  it('supports custom namespaces and TTLs without actor persistence', async () => {
    vi.useFakeTimers();
    const kv = new InMemoryKeyValueService();
    const service = new InternalErrorPersistenceService(kv, {
      keyPrefix: 'app-errors:',
      ttlSeconds: 60,
    });

    const result = await service.persist({ error: createInternalError() });

    expect(result?.recordKey).toBe(
      `app-errors:${getInternalErrorHash('boom')}`
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await kv.get(result?.recordKey ?? '')).toBeNull();
  });

  it('ignores errors outside the internal-server category', async () => {
    const kv = new InMemoryKeyValueService();
    const service = new InternalErrorPersistenceService(kv);
    const error = Object.assign(new Error('boom'), { code: 'BAD_REQUEST' });

    await expect(service.persist({ error })).resolves.toBeNull();
    expect(await kv.get(`internal-error:${getInternalErrorHash('boom')}`)).toBe(
      null
    );
  });

  it('extracts pathname from HTTP(S) referer URLs without query strings or fragments', () => {
    expect(
      getInternalErrorPagePath(
        'https://app.example.com/assignments/42?token=secret#section'
      )
    ).toBe('/assignments/42');
    expect(getInternalErrorPagePath('javascript:alert(1)')).toBeNull();
    expect(getInternalErrorPagePath('not-a-url')).toBeNull();
    expect(getInternalErrorPagePath(null)).toBeNull();
  });

  it('creates the same public support identifier and 7-day retention default as Lexsee', () => {
    expect(getInternalErrorHash('boom')).toBe('cd2fd39bc6b0130a');
    expect(getPublicInternalErrorMessage('boom')).toBe(
      'Internal server error #cd2fd39bc6b0130a'
    );
    expect(INTERNAL_ERROR_TTL_SECONDS).toBe(604_800);
  });
});
