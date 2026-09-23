import { expect, it } from 'vitest';
import { CustomError } from './custom-error';

it('retains the original cause and typed code', () => {
  const cause = new Error('Socket closed');
  const error = new CustomError('Request failed', 'REQUEST_FAILED', { cause });
  expect(error).toBeInstanceOf(Error);
  expect(error.cause).toBe(cause);
  expect(error.code).toBe('REQUEST_FAILED');
  expect(error.message).toBe('Request failed');
});
