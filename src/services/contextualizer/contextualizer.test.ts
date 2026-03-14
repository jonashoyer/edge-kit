import { describe, expect, it } from 'vitest';

import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import {
  Contextualizer,
  type ContextProvider,
} from './contextualizer';

describe('Contextualizer', () => {
  it('fetches multiple providers in parallel', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const createProvider = (id: string): ContextProvider<{ value: string }, string> => ({
      id,
      async fetch(params) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;

        return {
          items: [params.value],
        };
      },
      render(item) {
        return item;
      },
    });

    const contextualizer = new Contextualizer({
      alpha: createProvider('alpha'),
      beta: createProvider('beta'),
    });

    const result = await contextualizer.fetch({
      alpha: { value: 'one' },
      beta: { value: 'two' },
    });

    expect(result.alpha.items).toEqual(['one']);
    expect(result.beta.items).toEqual(['two']);
    expect(maxInFlight).toBe(2);
  });

  it('caches provider results and respects bypassCache', async () => {
    let fetchCount = 0;

    const provider: ContextProvider<{ id: string }, string> = {
      id: 'users',
      getCacheKey(params) {
        return params.id;
      },
      async fetch(params) {
        fetchCount += 1;
        return {
          items: [`user:${params.id}:${fetchCount}`],
        };
      },
      render(item) {
        return item;
      },
    };

    const contextualizer = new Contextualizer(
      { users: provider },
      {
        kv: new InMemoryKeyValueService(),
      }
    );

    const first = await contextualizer.fetchProvider('users', { id: '1' });
    const second = await contextualizer.fetchProvider('users', { id: '1' });
    const third = await contextualizer.fetchProvider(
      'users',
      { id: '1' },
      { bypassCache: true }
    );

    expect(first.items).toEqual(['user:1:1']);
    expect(second.items).toEqual(['user:1:1']);
    expect(third.items).toEqual(['user:1:2']);
    expect(fetchCount).toBe(2);
  });

  it('renders with renderPage when available and falls back to item rendering', async () => {
    const contextualizer = new Contextualizer({
      page: {
        id: 'page',
        async fetch() {
          return {
            items: ['a', 'b'],
          };
        },
        render(item) {
          return item.toUpperCase();
        },
        renderPage(result) {
          return result.items.join('|');
        },
      },
      list: {
        id: 'list',
        async fetch() {
          return {
            items: ['c', 'd'],
          };
        },
        render(item) {
          return `item:${item}`;
        },
      },
    });

    const pageResult = await contextualizer.fetchProvider('page', undefined);
    const listResult = await contextualizer.fetchProvider('list', undefined);

    expect(contextualizer.renderProvider('page', pageResult)).toBe('a|b');
    expect(contextualizer.renderProvider('list', listResult)).toBe(
      'item:c\n\nitem:d'
    );
  });

  it('fetchAndRender returns both typed data and rendered output', async () => {
    const contextualizer = new Contextualizer({
      notes: {
        id: 'notes',
        async fetch() {
          return {
            items: [{ body: 'hello' }, { body: 'world' }],
            nextCursor: 'next-page',
          };
        },
        render(item) {
          return item.body;
        },
      },
    });

    const result = await contextualizer.fetchAndRender({
      notes: undefined,
    });

    expect(result.data.notes.items).toEqual([
      { body: 'hello' },
      { body: 'world' },
    ]);
    expect(result.data.notes.nextCursor).toBe('next-page');
    expect(result.rendered.notes).toBe('hello\n\nworld');
    expect(result.request).toEqual({ notes: undefined });
  });
});
