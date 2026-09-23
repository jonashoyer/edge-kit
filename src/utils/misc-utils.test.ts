import { expect, it, vi } from 'vitest';
import { memoize } from './misc-utils';

it('memoizes undefined results as well as defined results', () => {
  const fn = vi.fn((value: number) => (value === 0 ? undefined : value * 2));
  const memoized = memoize(fn);
  expect(memoized(0)).toBeUndefined();
  expect(memoized(0)).toBeUndefined();
  expect(memoized(2)).toBe(4);
  expect(memoized(2)).toBe(4);
  expect(fn).toHaveBeenCalledTimes(2);
});
