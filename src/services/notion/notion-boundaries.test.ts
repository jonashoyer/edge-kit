import type { QueryDataSourceParameters } from '@notionhq/client';
import type { SupportedFetch } from '@notionhq/client/build/src/fetch-types';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  NotionClient,
  type NotionUpdateMarkdownOptions,
} from './notion-client';

const list = (results: unknown[], next: string | null = null) => ({
  object: 'list',
  results,
  has_more: next !== null,
  next_cursor: next,
});
const block = (id: string, hasChildren = false) => ({
  object: 'block',
  id,
  type: 'paragraph',
  paragraph: { rich_text: [] },
  has_children: hasChildren,
});
const synced = (id: string, source: string) => ({
  object: 'block',
  id,
  type: 'synced_block',
  synced_block: { synced_from: { type: 'block_id', block_id: source } },
  has_children: true,
});
const markdown = {
  object: 'page_markdown',
  id: 'page',
  markdown: '# Hello',
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
  ])('never silently returns incomplete content from the text convenience %#', async (response) => {
    const { client } = clientFor(() => response);
    await expect(client.getPageMarkdown('page')).resolves.toMatchObject({
      complete: false,
    });
    await expect(client.getPageContent('page')).rejects.toMatchObject({
      code: 'incomplete_content',
    });
  });

  it.each([
    { ...list([]), has_more: true },
    { ...list([]), next_cursor: 'unexpected' },
    { ...list([]), has_more: 'false' },
    list([{ object: 'page', id: '' }]),
    list([{ object: 'block', id: 'wrong-kind' }]),
  ])('rejects invalid query envelopes %#', async (response) => {
    const { client } = clientFor(() => response);
    await expect(client.queryDataSource('source')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it.each([
    null,
    {},
    [{ id: '' }],
    [{ name: 'No id' }],
  ])('rejects malformed database source lists %#', async (sources) => {
    const { client } = clientFor(() => ({
      object: 'database',
      id: 'db',
      data_sources: sources,
    }));
    await expect(client.resolveDataSourceId('db')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('distinguishes the source parent database from its containing page', async () => {
    const { client } = clientFor(() =>
      list([
        {
          object: 'data_source',
          id: 'source',
          title: [{ plain_text: 'Tasks' }],
          icon: null,
          parent: { type: 'database_id', database_id: 'db' },
          database_parent: { type: 'page_id', page_id: 'parent-page' },
          in_trash: true,
        },
      ])
    );
    await expect(client.getDataSources()).resolves.toEqual([
      {
        id: 'source',
        name: 'Tasks',
        databaseId: 'db',
        pageId: 'parent-page',
        icon: null,
        inTrash: true,
        archived: true,
      },
    ]);
  });

  it('allows known reads and denies unlisted reads and writes through the SDK', async () => {
    const fetch = vi.fn<SupportedFetch>(async () => Response.json(markdown));
    const client = new NotionClient('test', {
      fetch,
      pacing: false,
      retry: false,
      readOnly: true,
    });
    await client.client.pages.retrieveMarkdown({ page_id: 'page' });
    await client.client.dataSources.query({ data_source_id: 'source' });
    await client.client.search({});
    await expect(
      client.client.request({ path: 'future-endpoint', method: 'get' })
    ).rejects.toMatchObject({ code: 'read_only' });
    await expect(
      client.client.blocks.delete({ block_id: 'block' })
    ).rejects.toMatchObject({ code: 'read_only' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('supports a custom API base URL under read-only policy', async () => {
    const fetch = vi.fn<SupportedFetch>(async () => Response.json(markdown));
    const client = new NotionClient('test', {
      fetch,
      baseUrl: 'https://proxy.example/notion/',
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
  const checkbox = { property: 'Ready', checkbox: { equals: true } };
  it('preserves nested AND filters and derives the maximum timestamp', async () => {
    let body: Record<string, unknown> = {};
    const { client } = clientFor((_url, query) => {
      body = query;
      return list([
        {
          object: 'page',
          id: 'latest',
          url: 'https://notion.so/latest',
          last_edited_time: '2026-09-02T00:00:00Z',
        },
        {
          object: 'page',
          id: 'older',
          url: 'https://notion.so/older',
          last_edited_time: '2026-09-01T00:00:00Z',
        },
      ]);
    });
    const changes = await client.queryDataSourceChanges('source', {
      since: '2026-08-01',
      filter: { and: [{ or: [checkbox] }] },
    });
    expect(changes.highWaterTimestamp).toBe('2026-09-02T00:00:00.000Z');
    expect(body).toMatchObject({
      filter: {
        and: [
          { or: [checkbox] },
          {
            timestamp: 'last_edited_time',
            last_edited_time: { on_or_after: '2026-08-01T00:00:00.000Z' },
          },
        ],
      },
      sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
    });
    expect(body).not.toHaveProperty('since');
  });

  it('rejects nested OR plus since rather than sending unsupported filter depth', async () => {
    const { client, fetch } = clientFor(() => list([]));
    const filter: QueryDataSourceParameters['filter'] = {
      or: [{ and: [checkbox] }],
    };
    await expect(
      client.queryDataSourceChanges('source', { since: '2026-08-01', filter })
    ).rejects.toMatchObject({ code: 'unsupported_filter' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { object: 'page', id: 'partial' },
    { object: 'page', id: 'bad-date', last_edited_time: 'invalid' },
  ])('does not advance checkpoints past unusable page metadata %#', async (page) => {
    const { client } = clientFor(() => list([page]));
    await expect(client.queryDataSourceChanges('source')).rejects.toMatchObject(
      { code: 'invalid_response' }
    );
  });
});
