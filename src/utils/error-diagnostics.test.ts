import { describe, expect, it, vi } from 'vitest';
import { serializeErrorDiagnostics } from './error-diagnostics';

describe('serializeErrorDiagnostics', () => {
  it('retains error context while redacting credentials and payloads in causes', () => {
    const cause = Object.assign(new Error('provider failed'), {
      access_token: 'secret',
      apiKey: 'secret',
      metadata: new Map([['clientSecret', 'secret']]),
      password: 'secret',
      requestBody: 'private content',
      response: {
        body: 'private content',
        headers: { authorization: 'secret' },
      },
      status: 502,
    });
    Object.defineProperty(cause, 'requestId', { value: 'request-123' });

    const result = serializeErrorDiagnostics(new Error('wrapper', { cause }));
    expect(result).toMatchObject({
      cause: {
        message: 'provider failed',
        requestId: 'request-123',
        status: 502,
      },
      message: 'wrapper',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('private content');
  });

  it('bounds deep causes, wide collections, and long strings', () => {
    let error = new Error('root');
    for (let index = 0; index < 10_000; index += 1) {
      error = new Error('wrapper', { cause: error });
    }
    expect(() => serializeErrorDiagnostics(error)).not.toThrow();

    for (const value of [
      'x'.repeat(100_000),
      Array.from({ length: 10_000 }, () => 'x'.repeat(8000)),
      new Set(Array.from({ length: 10_000 }, (_, index) => index)),
      Object.fromEntries(
        Array.from({ length: 10_000 }, (_, index) => [index, 'x'.repeat(8000)])
      ),
    ]) {
      const result = JSON.stringify(serializeErrorDiagnostics(value));
      expect(result.length).toBeLessThanOrEqual(32_768);
      expect(result).toContain('[truncated]');
    }
  });

  it('marks circular references without treating shared values as circular', () => {
    const shared = { value: 'retained' };
    const error = Object.assign(new Error('failure'), {
      first: shared,
      second: shared,
    });
    error.cause = error;

    expect(serializeErrorDiagnostics(error)).toMatchObject({
      cause: '[circular reference]',
      first: shared,
      second: shared,
    });
  });

  it('does not execute accessors while inspecting an error', () => {
    const getter = vi.fn(() => {
      throw new Error('must not run');
    });
    const error = new Error('failure');
    Object.defineProperty(error, 'detail', { get: getter });

    expect(serializeErrorDiagnostics(error)).toMatchObject({
      detail: '[accessor not evaluated]',
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps values that JSON would otherwise omit or fail to encode', () => {
    const value = {
      bigint: 123n,
      date: new Date('2026-09-16T12:00:00Z'),
      entries: new Map([['key', { status: 500 }]]),
      missing: undefined,
      notFinite: Number.POSITIVE_INFINITY,
      values: new Set(['a', 'b']),
    };

    expect(
      JSON.parse(JSON.stringify(serializeErrorDiagnostics(value)))
    ).toEqual({
      bigint: '123',
      date: '2026-09-16T12:00:00.000Z',
      entries: [['key', { status: 500 }]],
      missing: 'undefined',
      notFinite: 'Infinity',
      values: ['a', 'b'],
    });
  });
});
