import { Client } from '@notionhq/client';
import type { SupportedFetch } from '@notionhq/client/build/src/fetch-types';
import { describe, expect, it, vi } from 'vitest';
import { Throttler } from '../../utils/throttler';
import { NotionClient } from './notion-client';

const jsonResponse = (
  body: unknown,
  init: { status?: number; headers?: Headers } = {}
) => ({
  body: null,
  headers: init.headers ?? new Headers(),
  ok: init.status === undefined || (init.status >= 200 && init.status < 300),
  status: init.status ?? 200,
  text: async () => JSON.stringify(body),
});

const pageResult = (
  id: string,
  lastEditedTime = '2026-01-01T00:00:00.000Z'
) => ({
  id,
  last_edited_time: lastEditedTime,
  object: 'page',
});

const paragraphBlock = (id: string, hasChildren = false) => ({
  archived: false,
  created_by: { id: 'user', object: 'user' },
  created_time: '2026-01-01T00:00:00.000Z',
  has_children: hasChildren,
  id,
  in_trash: false,
  last_edited_by: { id: 'user', object: 'user' },
  last_edited_time: '2026-01-01T00:00:00.000Z',
  object: 'block',
  paragraph: { color: 'default', rich_text: [] },
  parent: { page_id: 'page', type: 'page_id' },
  type: 'paragraph',
});

const syncedBlock = (
  id: string,
  syncedFrom: string | null,
  hasChildren = false
) => ({
  archived: false,
  created_by: { id: 'user', object: 'user' },
  created_time: '2026-01-01T00:00:00.000Z',
  has_children: hasChildren,
  id,
  in_trash: false,
  last_edited_by: { id: 'user', object: 'user' },
  last_edited_time: '2026-01-01T00:00:00.000Z',
  object: 'block',
  parent: { page_id: 'page', type: 'page_id' },
  synced_block: syncedFrom
    ? { synced_from: { block_id: syncedFrom, type: 'block_id' } }
    : { synced_from: null },
  type: 'synced_block',
});

describe('NotionClient', () => {
  it('constructs an SDK client with an escape hatch and accepts injected clients', () => {
    const managed = new NotionClient('secret', { pacing: false });
    expect(managed.client).toBeInstanceOf(Client);

    const injectedSdk = { users: { me: vi.fn() } };
    const injected = new NotionClient({
      client: injectedSdk as unknown as Client,
    });
    expect(injected.client).toBe(injectedSdk);
    expect(
      () =>
        new NotionClient({
          client: injectedSdk as unknown as Client,
          readOnly: true,
        } as unknown as { client: Client })
    ).toThrow('readOnly');
  });

  it('returns native markdown completeness metadata and can reject incomplete content', async () => {
    const client = new NotionClient({
      client: {
        pages: {
          retrieveMarkdown: vi.fn().mockResolvedValue({
            id: 'page-1',
            markdown: 'A <unknown block="bookmark" />',
            object: 'page_markdown',
            truncated: false,
            unknown_block_ids: ['block-1'],
          }),
        },
      } as unknown as Client,
    });

    const result = await client.getPageMarkdown('page-1');
    expect(result.complete).toBe(false);
    expect(result.incompleteReasons).toEqual([
      'unknown_block_ids',
      'unknown_placeholders',
    ]);
    await expect(
      client.getPageMarkdown('page-1', { onIncomplete: 'throw' })
    ).rejects.toThrow('incomplete');
    await expect(client.getPageContent('page-1')).rejects.toThrow('incomplete');
  });

  it('uses native markdown bodies for create and update operations', async () => {
    const requests: Array<{ body: unknown; method: string; path: string }> = [];
    const fetch: SupportedFetch = async (url, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? 'GET',
        path: new URL(url).pathname,
      });
      return jsonResponse(pageResult('page-1'));
    };
    const client = new NotionClient('secret', { fetch, pacing: false });

    await client.createPage({
      markdown: '# Hello',
      parent: { data_source_id: 'source-1' },
      properties: { Name: { title: [{ text: { content: 'Hello' } }] } },
    });
    await client.createPage('database-1', {}, 'legacy');
    await client.updatePageMarkdown('page-1', {
      replace_content: { new_str: '# Updated' },
      type: 'replace_content',
    });

    expect(requests).toMatchObject([
      {
        body: {
          markdown: '# Hello',
          parent: { data_source_id: 'source-1' },
        },
        method: 'POST',
        path: '/v1/pages',
      },
      {
        body: {
          markdown: 'legacy',
          parent: { database_id: 'database-1' },
        },
        method: 'POST',
        path: '/v1/pages',
      },
      {
        body: {
          replace_content: { new_str: '# Updated' },
          type: 'replace_content',
        },
        method: 'PATCH',
        path: '/v1/pages/page-1/markdown',
      },
    ]);
  });

  it('forwards query options and streams multiple data source pages', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        has_more: true,
        next_cursor: 'cursor-2',
        object: 'list',
        results: [pageResult('page-1')],
      })
      .mockResolvedValueOnce({
        has_more: false,
        next_cursor: null,
        object: 'list',
        results: [pageResult('page-2')],
      })
      .mockResolvedValueOnce({
        has_more: false,
        next_cursor: null,
        object: 'list',
        results: [],
      });
    const client = new NotionClient({
      client: { dataSources: { query } } as unknown as Client,
    });

    const streamed: string[] = [];
    for await (const result of client.iterateDataSource('source-1', {
      filter: { property: 'Name', rich_text: { is_not_empty: true } },
      page_size: 2,
      sorts: [{ direction: 'ascending', timestamp: 'last_edited_time' }],
    })) {
      streamed.push(result.id);
    }
    const collected = await client.queryDataSource('source-1');

    expect(streamed).toEqual(['page-1', 'page-2']);
    expect(collected).toEqual([]);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data_source_id: 'source-1',
        page_size: 2,
        start_cursor: null,
      })
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ start_cursor: 'cursor-2' })
    );
  });

  it('fails on malformed list responses and repeated cursors', async () => {
    const malformed = new NotionClient({
      client: {
        dataSources: { query: vi.fn().mockResolvedValue({ object: 'page' }) },
      } as unknown as Client,
    });
    await expect(malformed.queryDataSource('source-1')).rejects.toThrow(
      'Invalid Notion list'
    );

    const repeated = new NotionClient({
      client: {
        dataSources: {
          query: vi.fn().mockResolvedValue({
            has_more: true,
            next_cursor: 'again',
            object: 'list',
            results: [pageResult('page-1')],
          }),
        },
      } as unknown as Client,
    });
    await expect(repeated.queryDataSource('source-1')).rejects.toThrow(
      'Repeated cursor'
    );
  });

  it('resolves database data source ids only when unambiguous', async () => {
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({ data_sources: [], id: 'db', object: 'database' })
      .mockResolvedValueOnce({
        data_sources: [
          { id: 'source-1', name: 'One' },
          { id: 'source-2', name: 'Two' },
        ],
        id: 'db',
        object: 'database',
      })
      .mockResolvedValueOnce({
        data_sources: [{ id: 'source-1', name: 'One' }],
        id: 'db',
        object: 'database',
      });
    const client = new NotionClient({
      client: { databases: { retrieve } } as unknown as Client,
    });

    await expect(client.resolveDataSourceId('db')).rejects.toThrow('no data');
    await expect(client.resolveDataSourceId('db')).rejects.toThrow('multiple');
    await expect(client.resolveDataSourceId('db')).resolves.toBe('source-1');
  });

  it('builds nested paginated block trees and rejects partial records, cycles, depth, and size bounds', async () => {
    const list = vi.fn(async ({ block_id: blockId, start_cursor: cursor }) => {
      if (blockId === 'page' && cursor === null) {
        return {
          has_more: true,
          next_cursor: 'next',
          object: 'list',
          results: [paragraphBlock('a', true)],
        };
      }
      if (blockId === 'page' && cursor === 'next') {
        return {
          has_more: false,
          next_cursor: null,
          object: 'list',
          results: [paragraphBlock('b')],
        };
      }
      return {
        has_more: false,
        next_cursor: null,
        object: 'list',
        results: [paragraphBlock(`${blockId}-child`)],
      };
    });
    const client = new NotionClient({
      client: { blocks: { children: { list } } } as unknown as Client,
    });

    const tree = await client.getPageBlocks('page');
    expect(tree.map((node) => node.id)).toEqual(['a', 'b']);
    expect(tree.at(0)?.children.map((node) => node.id)).toEqual(['a-child']);

    const partial = new NotionClient({
      client: {
        blocks: {
          children: {
            list: vi.fn().mockResolvedValue({
              has_more: false,
              next_cursor: null,
              object: 'list',
              results: [{ id: 'partial', object: 'block' }],
            }),
          },
        },
      } as unknown as Client,
    });
    await expect(partial.getPageBlocks('page')).rejects.toThrow(
      'invalid result'
    );

    const cycle = new NotionClient({
      client: {
        blocks: {
          children: {
            list: vi.fn(async ({ block_id: blockId }) => ({
              has_more: false,
              next_cursor: null,
              object: 'list',
              results:
                blockId === 'page'
                  ? [paragraphBlock('a', true)]
                  : [syncedBlock('sync', 'a')],
            })),
          },
        },
      } as unknown as Client,
    });
    await expect(cycle.getPageBlocks('page')).rejects.toThrow('Cycle');
    await expect(client.getPageBlocks('page', { maxDepth: 1 })).rejects.toThrow(
      'maxDepth'
    );
    await expect(
      client.getPageBlocks('page', { maxBlocks: 1 })
    ).rejects.toThrow('maxBlocks');
  });

  it('denies writes through the SDK escape hatch when readOnly is managed at fetch boundary', async () => {
    const fetch = vi.fn(async () => jsonResponse(pageResult('page-1')));
    const client = new NotionClient('secret', {
      fetch,
      pacing: false,
      readOnly: true,
    });

    await client.client.search({});
    await expect(
      client.client.pages.create({ markdown: '# denied' })
    ).rejects.toThrow('readOnly');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('paces concurrent SDK requests and retry attempts', async () => {
    vi.useFakeTimers();
    try {
      const callTimes: number[] = [];
      const fetch = vi
        .fn<SupportedFetch>()
        .mockImplementationOnce(async () => {
          callTimes.push(Date.now());
          return jsonResponse(
            {
              code: 'rate_limited',
              message: 'slow down',
              object: 'error',
              status: 429,
            },
            { headers: new Headers({ 'retry-after': '0' }), status: 429 }
          );
        })
        .mockImplementation(async () => {
          callTimes.push(Date.now());
          return jsonResponse({
            has_more: false,
            next_cursor: null,
            object: 'list',
            results: [],
            type: 'page_or_data_source',
          });
        });
      const client = new NotionClient('secret', {
        fetch,
        pacing: { minimumIntervalMs: 10 },
        retry: { initialRetryDelayMs: 1, maxRetries: 1, maxRetryDelayMs: 1 },
      });

      const requests = Promise.all([
        client.client.search({}),
        client.client.search({}),
      ]);
      await vi.advanceTimersByTimeAsync(100);
      await requests;

      expect(callTimes).toHaveLength(3);
      expect(callTimes.at(1)! - callTimes.at(0)!).toBeGreaterThanOrEqual(10);
      expect(callTimes.at(2)! - callTimes.at(1)!).toBeGreaterThanOrEqual(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves typed property and rich text helpers', () => {
    const page = {
      id: 'page-1',
      object: 'page',
      properties: {
        Name: {
          id: 'title',
          title: [
            {
              annotations: {
                bold: true,
                code: false,
                color: 'default',
                italic: false,
                strikethrough: false,
                underline: false,
              },
              href: null,
              plain_text: 'Hello',
              text: { content: 'Hello', link: null },
              type: 'text',
            },
          ],
          type: 'title',
        },
      },
    } as Parameters<typeof NotionClient.getProperty>[0];

    expect(NotionClient.getProperty(page, 'title', 'Name')?.type).toBe('title');
    expect(NotionClient.getPropertyValue(page, 'title', 'Name')).toBe(
      '**Hello**'
    );
    expect(
      NotionClient.applyAnnotations('x', {
        bold: false,
        code: true,
        color: 'default',
        italic: false,
        strikethrough: false,
        underline: false,
      })
    ).toBe('`x`');
  });
});

describe('Throttler', () => {
  it('preserves numeric RPM construction and supports serialized spacing', async () => {
    vi.useFakeTimers();
    try {
      const throttler = new Throttler({ minimumIntervalMs: 10 });
      const starts: number[] = [];
      const jobs = [1, 2, 3].map(async () => {
        await throttler.waitForSlot();
        starts.push(Date.now());
      });

      await vi.advanceTimersByTimeAsync(30);
      await Promise.all(jobs);

      expect(starts).toHaveLength(3);
      expect(starts.at(1)! - starts.at(0)!).toBeGreaterThanOrEqual(10);
      expect(starts.at(2)! - starts.at(1)!).toBeGreaterThanOrEqual(10);

      await expect(new Throttler(60).waitForSlot()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
