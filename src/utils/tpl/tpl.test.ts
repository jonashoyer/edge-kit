import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fnv1a64B64 } from '../crypto-utils';
import { tpl, tpls } from './tpl';

describe('Prompt', () => {
  it('preserves metadata on the boxed tpl result', () => {
    const result = tpl`Hello world`;
    expect(typeof result).toBe('object');
    expect(String(result)).toBe('Hello world');
    expect(tpl.getHash(result)).toBe(fnv1a64B64('Hello world'));
  });
  it('returns a primitive string through tpls', () => {
    const a = tpls`Hello world`;
    expect(typeof a).toBe('string');
  });

  it('returns a Zod-compatible string through tpls', () => {
    const a = tpls`Hello world`;
    const parse = z.string().safeParse(a);
    expect(parse.success).toBe(true);
  });

  it('should dedent', () => {
    const a = tpl`
      Hello
      world
    `;
    expect(a.toString()).toBe('Hello\nworld');
  });

  it('should dedent with interpolation', () => {
    const a = tpl`
      Hello ${'world'}
    `;
    expect(String(a)).toBe('Hello world');
  });

  it('should dedent with indentation', () => {
    const a = tpl`
      Hello
        world
    `;

    const expected = `Hello
  world`;

    expect(a.toString()).toBe(expected);
  });

  it('should match', () => {
    const a = tpl`Hello world`;
    const b = tpl`Hello world`;
    expect(tpl.getHash(a)).toBeDefined();
    expect(tpl.getHash(a)).toBe(tpl.getHash(b));
  });

  it('should match with diff indentation', () => {
    const a = tpl`
      Hello
    `;
    const b = tpl`
        Hello
    `;
    expect(tpl.getHash(a)).toBeDefined();
    expect(tpl.getHash(a)).toBe(tpl.getHash(b));
  });

  it('should match hash', () => {
    const a = tpl`Hello`;
    const hash = fnv1a64B64('Hello');
    expect(tpl.getHash(a)).toBe(hash);
  });

  it('should match hash with interpolation', () => {
    const a = tpl`
      Hello ${'world'}
    `;

    const hash = fnv1a64B64('Hello _TPL$_');
    expect(tpl.getHash(a)).toBe(hash);
  });

  it('should match hash with interpolation and dedent', () => {
    const a = tpl`
      Hello
        ${'world'}
      world
    `;
    const hash = fnv1a64B64('Hello\n  _TPL$_\nworld');
    expect(tpl.getHash(a)).toBe(hash);
  });

  it('should not match with diff interpolation', () => {
    const a = tpl`Hello world`;
    const b = tpl`${'ANOTHER '}Hello world`;
    expect(tpl.getHash(a)).toBeDefined();
    expect(tpl.getHash(a)).not.toBe(tpl.getHash(b));
  });

  it('should not match with diff interpolation', () => {
    const a = tpl`Hello world`;
    const b = tpl`Hello ${'world'}`;
    expect(tpl.getHash(a)).toBeDefined();
    expect(tpl.getHash(a)).not.toBe(tpl.getHash(b));
  });
});
