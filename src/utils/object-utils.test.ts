import { expect, it } from 'vitest';
import { deserializeObjectKeys, serializeObjectKeys } from './object-utils';

it('restores captured insertion order without mutating the serialized input', () => {
  const original = Object.fromEntries([
    ['z', 1],
    ['a', 2],
  ]);
  const serialized = serializeObjectKeys(original);
  expect(serialized).toBe(original);
  expect(serialized.__keys).toEqual(['z', 'a']);
  const input = { ...serialized, a: 3 };
  const restored = deserializeObjectKeys(input);
  expect(Object.keys(restored)).toEqual(['z', 'a']);
  expect(restored).toEqual({ a: 3, z: 1 });
  expect(input.__keys).toEqual(['z', 'a']);
});

it('returns objects without order metadata unchanged', () => {
  const input = { name: 'Alice' };
  expect(deserializeObjectKeys(input)).toBe(input);
});
