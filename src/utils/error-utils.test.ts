import { describe, expect, it } from 'vitest';
import { serializeError } from './error-utils';

describe('serializeError', () => {
  it('serializes generic scalar details from a nested error cause chain', () => {
    const providerError = Object.assign(new Error('provider unavailable'), {
      accessToken: 'visible diagnostic value',
      category: 'upstream',
      requestId: 'req_123',
      retryAfterMs: 5000,
    });
    const operationError = new Error('operation failed', {
      cause: providerError,
    });
    const error = new Error('request failed', { cause: operationError });

    const serialized = serializeError(error);

    expect(serialized.causes).toHaveLength(2);
    expect(serialized.causes?.[1]).toMatchObject({
      details: {
        accessToken: 'visible diagnostic value',
        category: 'upstream',
        requestId: 'req_123',
        retryAfterMs: 5000,
      },
      message: 'provider unavailable',
    });
  });

  it('stops when an error cause chain is circular', () => {
    const outer = new Error('outer');
    const inner = new Error('inner', { cause: outer });
    outer.cause = inner;

    expect(serializeError(outer).causes).toEqual([
      expect.objectContaining({ message: 'inner' }),
      { message: '[circular error cause]' },
    ]);
  });

  it('limits the depth of an error cause chain', () => {
    let error = new Error('root cause');
    for (let index = 0; index < 6; index += 1) {
      error = new Error(`wrapper ${index}`, { cause: error });
    }

    expect(serializeError(error).causes?.at(-1)).toEqual({
      message: '[error cause chain truncated]',
    });
  });

  it('does not add causes to an error without one', () => {
    const error = Object.assign(new Error('failure'), { requestId: 'req_456' });

    expect(serializeError(error)).toMatchObject({
      causes: [],
      details: { requestId: 'req_456' },
    });
  });

  it('omits object details and strings already present in the message', () => {
    const error = Object.assign(
      new Error('Request to upstream-service failed'),
      {
        query: 'upstream-service',
        response: { status: 500 },
        status: 500,
      }
    );

    expect(serializeError(error).details).toEqual({ status: 500 });
  });
});
