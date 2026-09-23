import type { QueryDataSourceParameters } from '@notionhq/client';
import type { SupportedFetch } from '@notionhq/client/build/src/fetch-types';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  NotionClient,
  type NotionUpdateMarkdownOptions,
} from './notion-client';

const list = (results: unknown[], next: string | null = null) => ({
  has_more: next !== null,
  next_cursor: next,
  object: 'list',
  results,
});
const block = (id: string, hasChildren = false) => ({
  has_children: hasChildren,
  id,
  object: 'block',
  paragraph: { rich_text: [] },
  type: 'paragraph',
});
const synced = (id: string, source: string) => ({
  has_children: true,
  id,
  object: 'block',
  synced_block: { synced_from: { block_id: source, type: 'block_id' } },
  type: 'synced_block',
});
const markdown = {
  id: 'page',
  markdown: '# Hello',
  object: 'page_markdown',
  truncated: false,
  unknown_block_ids: [],
};
const clientFor = (
  reply: (url: URL, body: Record<string, unknown>) => unknown | Promise<unknown>
) => {
  const fetch = vi.fn<SupportedFetch>(async (url, init) => {
    const body = await reply(
      new URL(url),
      init?.body ? JSON.parse(String(init.body)) : {}
    );
    return Response.json(body);
  });
  return {
    client: new NotionClient('test', { fetch, pacing: false, retry: false }),
    fetch,
  };
};

describe('Notion response and SDK boundaries', () => {
  it('passes transcript options to native Markdown and preserves its response', async () => {
    const { client, fetch } = clientFor(() => markdown);
    await expect(
      client.getPageMarkdown('page', { include_transcript: true })
    ).resolves.toMatchObject({ ...markdown, complete: true });
    expect(fetch.mock.calls.at(0)?.at(0)).toContain('include_transcript=true');
    await expect(client.getPageContent('page')).resolves.toBe('# Hello');
  });

  it.each([
    { ...markdown, object: 'page' },
    { ...markdown, unknown_block_ids: null },
    { ...markdown, truncated: 'false' },
    { ...markdown, markdown: 1 },
    { ...markdown, id: '' },
  ])('rejects malformed native Markdown %#', async (response) => {
    const { client } = clientFor(() => response);
    await expect(client.getPageMarkdown('page')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it.each([
    { ...markdown, truncated: true },
    { ...markdown, unknown_block_ids: ['missing'] },
    { ...markdown, markdown: '<unknown url="url" alt="embed"/>' },
  ])(
    'never silently returns incomplete content from the text convenience %#',
    async (response) => {
      const { client } = clientFor(() => response);
      await expect(client.getPageMarkdown('page')).resolves.toMatchObject({
        complete: false,
      });
      await expect(client.getPageContent('page')).rejects.toMatchObject({
        code: 'incomplete_content',
      });
    }
  );

  it.each([
    { ...list([]), has_more: true },
    { ...list([]), next_cursor: 'unexpected' },
    { ...list([]), has_more: 'false' },
    list([{ id: '', object: 'page' }]),
    list([{ id: 'wrong-kind', object: 'block' }]),
  ])('rejects invalid query envelopes %#', async (response) => {
    const { client } = clientFor(() => response);
    await expect(client.queryDataSource('source')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it.each([null, {}, [{ id: '' }], [{ name: 'No id' }]])(
    'rejects malformed database source lists %#',
    async (sources) => {
      const { client } = clientFor(() => ({
        data_sources: sources,
        id: 'db',
        object: 'database',
      }));
      await expect(client.resolveDataSourceId('db')).rejects.toMatchObject({
        code: 'invalid_response',
      });
    }
  );

  it('distinguishes the source parent database from its containing page', async () => {
    const { client } = clientFor(() =>
      list([
        {
          database_parent: { page_id: 'parent-page', type: 'page_id' },
          icon: null,
          id: 'source',
          in_trash: true,
          object: 'data_source',
          parent: { database_id: 'db', type: 'database_id' },
          title: [{ plain_text: 'Tasks' }],
        },
      ])
    );
    await expect(client.getDataSources()).resolves.toEqual([
      {
        archived: true,
        databaseId: 'db',
        icon: null,
        id: 'source',
        inTrash: true,
        name: 'Tasks',
        pageId: 'parent-page',
      },
    ]);
  });

  it('allows known reads and denies unlisted reads and writes through the SDK', async () => {
    const fetch = vi.fn<SupportedFetch>(async () => Response.json(markdown));
    const client = new NotionClient('test', {
      fetch,
      pacing: false,
      readOnly: true,
      retry: false,
    });
    await client.client.pages.retrieveMarkdown({ page_id: 'page' });
    await client.client.dataSources.query({ data_source_id: 'source' });
    await client.client.search({});
    await expect(
      client.client.request({ method: 'get', path: 'future-endpoint' })
    ).rejects.toMatchObject({ code: 'read_only' });
    await expect(
      client.client.blocks.delete({ block_id: 'block' })
    ).rejects.toMatchObject({ code: 'read_only' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('supports a custom API base URL under read-only policy', async () => {
    const fetch = vi.fn<SupportedFetch>(async () => Response.json(markdown));
    const client = new NotionClient('test', {
      baseUrl: 'https://proxy.example/notion/',
      fetch,
      pacing: false,
      readOnly: true,
    });
    await client.client.pages.retrieveMarkdown({ page_id: 'page' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps the legacy query ID semantics without sending an empty filter', async () => {
    const { client, fetch } = clientFor(() => list([]));
    await client.queryDatabase('source');
    expect(fetch.mock.calls.at(0)?.at(0)).toContain(
      '/data_sources/source/query'
    );
    const [, request] = fetch.mock.calls.at(0) ?? [];
    const body = JSON.parse(String(request?.body));
    expect(body).not.toHaveProperty('filter');
  });

  it('preserves the discriminated SDK update contract', () => {
    expectTypeOf<{
      type: 'replace_content';
      replace_content: { new_str: string };
    }>().toMatchTypeOf<NotionUpdateMarkdownOptions>();
    expectTypeOf<{
      type: 'insert_content';
      insert_content: { content: string };
    }>().toMatchTypeOf<NotionUpdateMarkdownOptions>();
    expectTypeOf<{
      type: 'replace_content';
    }>().not.toMatchTypeOf<NotionUpdateMarkdownOptions>();
    expectTypeOf<{
      type: 'insert_content';
      replace_content: { new_str: string };
    }>().not.toMatchTypeOf<NotionUpdateMarkdownOptions>();
  });
});

describe('bounded block reads', () => {
  it('stops pagination as soon as the node budget is exhausted', async () => {
    const { client, fetch } = clientFor(() => list([block('a')], 'more'));
    await expect(
      client.getPageBlocks('page', { maxBlocks: 1 })
    ).rejects.toMatchObject({ code: 'block_limit' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects depth overflow before fetching the next level', async () => {
    const { client, fetch } = clientFor(() => list([block('a', true)]));
    await expect(
      client.getPageBlocks('page', { maxDepth: 1 })
    ).rejects.toMatchObject({ code: 'block_limit' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('loads the original synced source and allows it in separate branches', async () => {
    const { client, fetch } = clientFor((url) =>
      url.pathname.includes('/page/')
        ? list([synced('copy-a', 'original'), synced('copy-b', 'original')])
        : list([block('shared-child')])
    );
    const tree = await client.getPageBlocks('page');
    expect(tree.map((node) => node.children.at(0)?.id)).toEqual([
      'shared-child',
      'shared-child',
    ]);
    expect(
      fetch.mock.calls.slice(1).map((call) => new URL(call[0]).pathname)
    ).toEqual(['/v1/blocks/original/children', '/v1/blocks/original/children']);
  });

  it('detects cycles back to the root with canonicalized IDs', async () => {
    const { client } = clientFor(() => list([synced('copy', 'ABCD')]));
    await expect(client.getPageBlocks('ab-cd')).rejects.toMatchObject({
      code: 'block_cycle',
    });
  });

  it('limits active child reads and finishes in-flight work before rejecting', async () => {
    let active = 0;
    let maximum = 0;
    const { client } = clientFor(async (url) => {
      if (url.pathname.includes('/page/'))
        return list([block('a', true), block('b', true), block('c', true)]);
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (url.pathname.includes('/a/')) throw new Error('failed subtree');
      return list([block('leaf')]);
    });
    await expect(
      client.getPageBlocks('page', { maxConcurrency: 2 })
    ).rejects.toThrow('failed subtree');
    expect(maximum).toBe(2);
    expect(active).toBe(0);
  });
});

describe('stateless change queries', () => {
  const checkbox = { checkbox: { equals: true }, property: 'Ready' };
  it('preserves nested AND filters and derives the maximum timestamp', async () => {
    let body: Record<string, unknown> = {};
    const { client } = clientFor((_url, query) => {
      body = query;
      return list([
        {
          id: 'latest',
          last_edited_time: '2026-09-02T00:00:00Z',
          object: 'page',
          url: 'https://notion.so/latest',
        },
        {
          id: 'older',
          last_edited_time: '2026-09-01T00:00:00Z',
          object: 'page',
          url: 'https://notion.so/older',
        },
      ]);
    });
    const changes = await client.queryDataSourceChanges('source', {
      filter: { and: [{ or: [checkbox] }] },
      since: '2026-08-01',
    });
    expect(changes.highWaterTimestamp).toBe('2026-09-02T00:00:00.000Z');
    expect(body).toMatchObject({
      filter: {
        and: [
          { or: [checkbox] },
          {
            last_edited_time: { on_or_after: '2026-08-01T00:00:00.000Z' },
            timestamp: 'last_edited_time',
          },
        ],
      },
      sorts: [{ direction: 'ascending', timestamp: 'last_edited_time' }],
    });
    expect(body).not.toHaveProperty('since');
  });

  it('rejects nested OR plus since rather than sending unsupported filter depth', async () => {
    const { client, fetch } = clientFor(() => list([]));
    const filter: QueryDataSourceParameters['filter'] = {
      or: [{ and: [checkbox] }],
    };
    await expect(
      client.queryDataSourceChanges('source', { filter, since: '2026-08-01' })
    ).rejects.toMatchObject({ code: 'unsupported_filter' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'partial', object: 'page' },
    { id: 'bad-date', last_edited_time: 'invalid', object: 'page' },
  ])(
    'does not advance checkpoints past unusable page metadata %#',
    async (page) => {
      const { client } = clientFor(() => list([page]));
      await expect(
        client.queryDataSourceChanges('source')
      ).rejects.toMatchObject({ code: 'invalid_response' });
    }
  );
});
