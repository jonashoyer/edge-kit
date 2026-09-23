---
provenance: Unvetted Synthetic
---

# Feature: Notion client

**Status:** `Active`

**Last Reviewed:** 2026-09-23

**Related ADRs:** [ADR-0024](../../../docs/adr/records/0024-use-the-official-notion-sdk-and-native-markdown-for-a-general-purpose-client.md)

## What this does

`NotionClient` wraps the official Notion SDK for applications that read, edit,
export, or synchronize Notion content. It adds guarded pagination, native Markdown
metadata, bounded block trees, typed property access, and optional request policy.
Consumers own Markdown conversion, checkpoint persistence, and reconciliation of
removed pages.

## Key goals

- Keep ordinary calls short and preserve direct SDK access for other operations.
- Keep database IDs distinct from queryable data source IDs.
- Report incomplete content rather than silently discarding it.
- Allow custom transports and credential-free tests through constructor injection.
- Keep the service copyable without an ingestion framework.

## Implementation constraints

- Use `@notionhq/client` endpoint types and native Markdown operations. The managed
  client defaults to API version `2026-03-11`; SDK options may override it.
- Keep retries in the SDK. `notion-transport.ts` admits each fetch attempt through
  `Throttler`, including SDK retries. Default minimum spacing is 350ms per wrapper
  instance. It is not a token-wide or distributed rate limit.
- Preserve the distinction between managed SDK construction and `{ client }`
  injection. Injected clients retain their own transport; reject `readOnly` there.
- Enforce managed read-only policy with the known endpoint allowlist before fetch,
  including calls made through `.client`. This guard does not restrict the token
  or separate SDK instances. Unknown read endpoints require an allowlist change.
- Validate list envelopes and advancing cursors in `notion-pagination.ts`.
  Validate the fields helpers use without duplicating every SDK response schema.
- Enforce block count, depth, and concurrency bounds while fetching. Finish the
  current batch before rejecting a failed traversal. Keep cycle detection scoped
  to each path so repeated synced sources in separate branches remain valid.
- Keep state and persistence out of `queryDataSourceChanges`. Validate timestamps
  before returning a checkpoint and preserve inclusive timestamp filtering.

## Public API / contracts

| API | Contract |
| --- | --- |
| `new NotionClient(token, options?)` | Constructs an SDK client with SDK options, optional `pacing`, and optional `readOnly`. |
| `new NotionClient({ client })` | Uses a caller-owned SDK client and its existing transport policy. |
| `.client` | The official SDK instance for operations the wrapper does not expose. |
| `getDataSources(options?)` | Collects data source search summaries with distinct source and parent database IDs. |
| `getDatabase(databaseId)` / `resolveDataSourceId(databaseId)` | Retrieves a database or resolves its sole source. Zero sources and multiple sources are explicit errors. |
| `queryDataSource(id, options?)` / `iterateDataSource(id, options?)` | Collects all results or yields individual results from guarded SDK pagination. SDK filters and sorts remain available. |
| `getPageMarkdown(id, options?)` | Returns the native response plus `complete`, `incompleteReasons`, and `unknownBlockIds`. `onIncomplete: 'throw'` rejects detected incompleteness. |
| `createPage(options)` / `updatePageMarkdown(id, options)` | Passes typed creation or Markdown edit operations to the SDK. Creation accepts native Markdown or structured children. |
| `getPageBlocks(id, options?)` | Returns descendant nodes `{ id, type, block, children }` below a page or block, excluding the supplied root itself. Defaults are depth 25, 10,000 blocks, concurrency 3, and page size 100. |
| `queryDataSourceChanges(id, options?)` | Adds inclusive `since` filtering and ascending edit order. Returns `{ results, highWaterTimestamp }`; empty results have a null timestamp. |
| `getPage(id, options?)` / `getUserSelf()` | Forwards page retrieval or current-user retrieval to the SDK. |
| Static property and rich-text helpers | Preserve `getProperty`, `getPropertyValue`, `extractIcon`, `uuidToId`, `applyAnnotations`, and `notionRichTextToMarkdown`. Title/rich-text values render as Markdown strings. |

Method and result types live in `notion-client.ts`, constructor options in
`notion-transport.ts`, and block options and tree nodes in `notion-blocks.ts`.
`NotionError` and its typed codes live in `notion-errors.ts`; SDK API errors retain
their original types.

Deprecated compatibility methods remain with explicit semantics:

- `getDatabases()` returns data source summaries.
- `queryDatabase(id)` still accepts a data source ID and uses descending edit order.
- `createPage(databaseId, properties, markdown?)` preserves the legacy database
  parent but now sends native Markdown.
- `getPageContent(id)` returns a string from native Markdown and rejects detected
  incompleteness. Its format and failure behavior changed.
- `recursiveCall()` uses iterative cursor traversal and rejects repeated cursors.

The static `notionBlocksToMarkdown()` converter was removed. Consumers must use
native Markdown or render fetched blocks themselves.

## Current state

Implemented: SDK configuration/injection, native Markdown reads and writes, data
source operations, guarded pagination, bounded block traversal, optional read-only
policy, change queries, and preserved property helpers. The service guide includes
copy instructions and migration notes.

Scoped tests use fake responses to cover transport policy and retries, incomplete
content, cursor failures, nested/synced blocks, bounds, database identity, change
filters, and timestamps. No live Notion request or workspace permission check was
performed as part of this implementation.

Deferred: portable Markdown conversion and durable synchronization. No converter
adapter, automatic subtree stitching, or checkpoint store exists.

## Known tech debt

- Native Markdown can contain custom tags and unsupported-content placeholders.
  The conservative `<unknown>` text check also detects literals in code examples.
  `include_transcript` defaults to false at the API, so `complete` does not imply
  transcript inclusion or full export of every Notion feature.
- SDK retries cap `Retry-After` at `maxRetryDelayMs`, 60 seconds by default.
  Rate-limit and overload errors retry for all methods; internal-server and
  service-unavailable errors retry only for GET and DELETE, excluding POST
  queries and writes. Network exceptions do not retry under this policy.
- `since` combined with a top-level OR containing nested groups fails with
  `unsupported_filter` to preserve Notion's two-level filter limit. Use an explicit
  timestamp filter with `queryDataSource` for those queries.
- Search and ordinary queries can return partial SDK objects. The change helper
  rejects results without usable edit timestamps before producing a checkpoint.

## What not to do

- Do not describe native Markdown as portable Markdown or treat `complete` as an
  exhaustive export guarantee.
- Do not fetch `getPageBlocks(blockId)` expecting the root block. Use
  `.client.blocks.retrieve({ block_id: blockId })` for it. Unresolved native
  subtrees can be requested separately with `getPageMarkdown(blockId)`.
- Do not crawl child pages or databases when extending block traversal. The tree
  reader follows block descendants and synced sources only.
- Do not add retries around SDK calls without disabling SDK retries.
- Do not silently select the first source of an ambiguous database.
- Do not persist a high-water timestamp before successful consumer processing.
  Replay/deduplicate timestamp ties and use full identifier comparisons to detect
  removals, moves, or permission loss.

## Dependencies

- `@notionhq/client` `^5.26.0` supplies SDK methods, endpoint types, and retries.
- `../../utils/throttler.ts` supplies pacing.
- `../../utils/custom-error.ts` supplies the typed wrapper error base.
- The official Notion integration API and caller-provided credentials supply data.

See [the service guide](../../../docs/services/notion.md) for usage examples.
