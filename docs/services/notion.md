---
provenance: Unvetted Synthetic
---

# Notion service

`src/services/notion/notion-client.ts` is a thin SDK-first wrapper around
`@notionhq/client`. It keeps the official SDK available as `client.client` while
adding copy-paste-friendly helpers for data sources, native Markdown, guarded
pagination, block-tree reads, optional read-only enforcement, and typed property
access.

## Copy into your project

Copy the TypeScript implementation files from `src/services/notion/`, plus
`src/utils/throttler.ts` and `src/utils/custom-error.ts`, preserving their relative
paths or updating imports. Install the official SDK:

```sh
pnpm add @notionhq/client@^5.26.0
```

Import `NotionClient` and its method/result types from `notion-client.ts`,
`NotionClientOptions` from `notion-transport.ts`, block options and tree types from
`notion-blocks.ts`, and `NotionError` from `notion-errors.ts`.

## Runtime defaults

- Constructs the SDK with an explicit Notion API version of `2026-03-11` unless
  overridden.
- Uses the SDK retry implementation by default. `Retry-After` is honored by the
  SDK but capped by the SDK `maxRetryDelayMs` option.
- Wraps each actual SDK `fetch` attempt, including retries, with serialized
  pacing. Each wrapper instance has its own 350ms minimum interval. Disable with
  `pacing: false` in tests or when you fully own transport pacing.
- Does not mutate `globalThis.fetch`.

## Quick start

```ts
import { NotionClient } from './src/services/notion/notion-client';

const token = process.env.NOTION_TOKEN;
if (!token) throw new Error('NOTION_TOKEN is required');

const notion = new NotionClient(token);
const dataSourceId = await notion.resolveDataSourceId('database-id');
const pages = await notion.queryDataSource(dataSourceId, { page_size: 50 });
const firstPage = pages.at(0);

if (firstPage) {
  const content = await notion.getPageMarkdown(firstPage.id, {
    onIncomplete: 'throw',
  });
  // content.markdown contains native Notion Markdown.
}
```

## Construction options

```ts
const notion = new NotionClient(token, {
  fetch: customFetch,
  pacing: { minimumIntervalMs: 350 },
  readOnly: true,
  retry: { maxRetries: 2, maxRetryDelayMs: 60_000 },
});

// For tests or externally managed transports:
const injected = new NotionClient({ client: officialSdkClient });
```

Use token/options construction when Edge Kit should enforce pacing, custom fetch,
or read-only policy. Injected clients are treated as externally managed; `readOnly`
is rejected there because the wrapper cannot enforce it at the fetch boundary.

The public `client.client` property is the official SDK escape hatch. With managed
`readOnly: true`, SDK calls through that property still pass through the guarded
fetch. The allowlist includes search, native Markdown retrieval, page/property
reads, block reads and children, data source reads and templates, database reads,
user reads, comments, file upload reads, and data source queries. Unknown endpoints and
writes are denied before calling the underlying fetch. New SDK GET endpoints
are not automatically allowed. This is a convenience guard only; real
integration capability restrictions still belong in Notion credentials.

The SDK is the only retry owner. Its current defaults allow two retries with a
60-second maximum delay, including a cap on `Retry-After`. It retries rate-limit
and overload errors for every method. Internal-server and service-unavailable
errors retry only for GET and DELETE; POST data source queries and page writes
do not receive those retries. Network exceptions are not retried by this policy.
If `customFetch` already retries, set `retry: false` to avoid stacked attempts.
Share one client or provide a shared paced transport when several consumers use
the same integration token.

## Data sources and databases

Prefer data-source-first APIs:

```ts
for await (const page of notion.iterateDataSource('data-source-id', {
  sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
})) {
  // Stream results without collecting everything first.
}

const all = await notion.queryDataSource('data-source-id');
```

`resolveDataSourceId(databaseId)` retrieves a database and returns its single data
source id. It fails when the database has zero or multiple data sources so callers
do not accidentally query the wrong source.

Compatibility methods remain:

- `getDatabases()` is deprecated and returns data source summaries.
- `queryDatabase(id)` is deprecated; historically its `id` was passed to
  `data_source_id`, so it still treats the argument as a data source id. Use
  `resolveDataSourceId(databaseId)` plus `queryDataSource(dataSourceId)` for new
  code.

## Native Markdown

```ts
const result = await notion.getPageMarkdown('page-id');

if (!result.complete) {
  result.incompleteReasons; // truncated, unknown_block_ids, unknown_placeholders
  result.unknownBlockIds;
}

await notion.getPageMarkdown('page-id', { onIncomplete: 'throw' });
```

Native Notion Markdown may include custom HTML/XML tags. `include_transcript`
defaults to false at the API; pass `{ include_transcript: true }` when needed.
Unsupported blocks such as bookmark/embed/link preview can appear as `<unknown>`
placeholders even when
`truncated` is false. The wrapper does not silently append fetched subtrees or
claim the output is complete while unknown placeholders remain. Its placeholder
check is conservative: literal `<unknown>` text inside a code example also marks
the result incomplete. `complete` means no detected incompleteness under the
requested API options, not a guarantee that every Notion feature was exported.

For truncated subtrees, pass each returned unknown block ID to
`getPageMarkdown(blockId)`. For unsupported blocks, retrieve the root block with
`notion.client.blocks.retrieve({ block_id: blockId })`. `getPageBlocks(blockId)`
returns children below that block, not the block itself. The caller owns recovery,
merging, and any conversion to portable Markdown.

`getPageContent(pageId)` remains as a deprecated string convenience and is strict:
it throws on truncated native Markdown, unknown block ids, or `<unknown>`
placeholders.

## Creating and updating pages with Markdown

```ts
await notion.createPage({
  parent: { data_source_id: 'data-source-id' },
  properties: {
    Name: { title: [{ text: { content: 'Launch note' } }] },
  },
  markdown: '# Launch note\n\nHello from native Notion Markdown.',
});

await notion.updatePageMarkdown('page-id', {
  type: 'replace_content',
  replace_content: { new_str: '# Rewritten' },
});
```

The old `createPage(databaseId, properties, markdown)` overload still exists for
compatibility and routes through the SDK `markdown` field. Raw block writes remain
available through the official SDK escape hatch.

`@tryfabric/martian` was removed. Page content uses the native API without a local
Markdown parser or full-page renderer.

## Block trees

```ts
const tree = await notion.getPageBlocks('page-id', {
  maxConcurrency: 3,
  maxDepth: 25,
  maxBlocks: 10_000,
});
```

`getPageBlocks()` returns descendants below the supplied page or block ID as
`{ id, type, block, children }`, preserving the raw full SDK block on each node.
It follows `has_children` block descendants, uses bounded breadth-first request
batches, validates paginated list shapes, fails on partial block records, and uses
path-scoped cycle detection so the same synced
reference can appear in separate branches but cycles fail explicitly. Synced block
references are followed. Limits apply during fetching; exceeding depth or count
rejects the whole operation rather than returning a partial tree. Requests already
in flight finish before the operation rejects. Top-level children have depth 1.

It does not crawl linked pages or databases beyond the block descendants returned
for the requested page/block.

## Incremental sync helper

The following example assumes your application supplies `checkpoint`,
`processPage`, and `saveCheckpoint`:

```ts
const changes = await notion.queryDataSourceChanges('data-source-id', {
  since: checkpoint,
});

for (const page of changes.results) {
  await processPage(page);
}
if (changes.highWaterTimestamp) {
  await saveCheckpoint(changes.highWaterTimestamp);
}
```

The helper adds an inclusive `last_edited_time` lower bound and ascending sort,
then returns a high-water timestamp from full page results. It does not persist
checkpoints. Persist only after processing, replay/dedupe timestamp ties, and run
a periodic full id diff to detect permanent deletion, permission loss, moves, or
other removals. Empty results return a null timestamp, so retain the prior
checkpoint. The helper rejects partial pages, data source results, and missing or
unparseable edit timestamps instead of issuing an unsafe checkpoint.

General SDK filters remain available. Combining `since` with a top-level OR that
already contains nested groups fails with `unsupported_filter`, because the extra
AND would exceed Notion's two-level filter limit. Use `queryDataSource` with an
explicit timestamp filter when you need to control that composition.

## Compatibility helpers

`getProperty`, `getPropertyValue`, `applyAnnotations`, and
`notionRichTextToMarkdown` remain available for typed page metadata access and
small rich-text formatting tasks.

`notionBlocksToMarkdown` was removed. Migrate callers to `getPageMarkdown()` or a
custom renderer built from `getPageBlocks()`. `getPageContent()` now returns native
Notion Markdown and rejects detected incomplete content, so its format and failure
behavior differ from the former flat renderer.

`recursiveCall` remains deprecated for existing callers, but now uses a loop and
rejects repeated cursors. Prefer the data source methods for new code.

## Errors and verification

Wrapper validation and policy errors use `NotionError` with a typed `code` such as
`incomplete_content`, `invalid_response`, `repeated_cursor`, `ambiguous_data_source`,
`block_limit`, or `read_only`. SDK API errors retain their SDK types.

The colocated tests use fake transports and injected clients. They cover native
Markdown, SDK retry/pacing behavior, read-only enforcement, block traversal,
pagination, database resolution, and change queries without credentials. Live
Notion behavior and workspace permissions require a separate integration check.
