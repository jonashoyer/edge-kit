import { expect, it } from 'vitest';
import { z } from 'zod';
import { zfd } from './form-utils';

it('parses scalar, repeated array and file fields', () => {
  const file = new File(['hello'], 'hello.txt');
  const form = new FormData();
  form.append('name', 'Alice');
  form.append('tags[]', 'one');
  form.append('tags[]', 'two');
  form.append('attachment', file);
  const parse = zfd(
    z.object({
      attachment: z.instanceof(File),
      name: z.string(),
      tags: z.array(z.string()),
    })
  );
  expect(parse(form)).toEqual({
    attachment: file,
    name: 'Alice',
    tags: ['one', 'two'],
  });
});

it('rejects scalar and array collisions with a useful error', () => {
  const form = new FormData();
  form.append('tags', 'one');
  form.append('tags[]', 'two');
  expect(() => zfd(z.object({ tags: z.array(z.string()) }))(form)).toThrow(
    'Cannot mix scalar and array fields: tags'
  );
});

it('retains last-value semantics for repeated scalar fields', () => {
  const form = new FormData();
  form.append('name', 'Alice');
  form.append('name', 'Bob');
  expect(zfd(z.object({ name: z.string() }))(form)).toEqual({ name: 'Bob' });
});

it('treats an empty scalar field as an empty array before array entries', () => {
  const form = new FormData();
  form.append('tags', '');
  form.append('tags[]', 'one');
  expect(zfd(z.object({ tags: z.array(z.string()) }))(form)).toEqual({
    tags: ['one'],
  });
});
