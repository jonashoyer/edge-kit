---
provenance: Unvetted Synthetic
---

# [0024] Use the official Notion SDK and native Markdown for a general-purpose client

**Status:** `Implemented`

**Date:** 2026-09-23

## TL;DR

Keep `NotionClient` as a general-purpose wrapper around the official SDK and use
Notion's native Markdown APIs for page content. Reuse SDK endpoint types and
retry behavior so Edge Kit can concentrate on convenient, testable operations.
Preserve content completeness metadata and expose structured blocks for callers
that need their own rendering.

## Decision

Build `src/services/notion/notion-client.ts` on `@notionhq/client` 5.26.0.
Support the simple API-key constructor, SDK configuration with a custom `fetch`,
and injection of a caller-owned SDK client. Keep direct SDK access available for
operations the wrapper does not expose.

Keep Notion-specific transport, block traversal, pagination, and error contracts
in `notion-transport.ts`, `notion-blocks.ts`, `notion-pagination.ts`, and
`notion-errors.ts` beside the client. Reuse the shared `Throttler` for request
spacing. Block traversal uses an iterative queue with bounded concurrent batches.

Use native Markdown retrieval, creation, and updates. The returned format is
Notion's enhanced Markdown, which can contain custom tags and unsupported-content
placeholders. Return the provider's completeness metadata alongside the content.
Convenience methods that return only text must make their incomplete-content
policy explicit.

Expose data source queries with the SDK's filter and sort options. Treat database
IDs and data source IDs as distinct identifiers. Resolve a database to its data
source only when it has exactly one, otherwise require an explicit selection.
Use guarded iterative pagination for wrapper operations and offer iteration when
callers should not have to collect every result in memory.

Offer bounded block-tree retrieval independently of Markdown retrieval. Preserve
block payloads so callers can write their own converters without replacing the
client or its transport. Follow synced-block references, but do not crawl linked
pages or databases. Keep typed property accessors and document compatibility
methods where their names or behavior differ from the clearer API.

Use the SDK as the default retry owner. Apply minimum request spacing in the
custom-fetch boundary for SDK clients created by the wrapper, including retry
attempts. A caller-owned client retains its own transport configuration. Do not
add a second retry loop around SDK operations.

Include an optional read-only request policy and a small stateless change-query
helper. Read-only mode restricts requests at the fetch boundary and supports the
read operations needed for Markdown, discovery, properties, and block access.
Reject read-only mode combined with a caller-owned SDK client because that client
can bypass the wrapper's transport policy. Change queries can filter and sort by
edit time and report checkpoint information; consumers own checkpoint storage and
reconciliation.

### Alternatives considered

- A custom REST reader using `fetchExt` would duplicate SDK endpoint contracts
  and retry behavior. The SDK already provides an injectable transport.
- A mandatory `notion-to-md` adapter would add another dependency and converter
  contract before a consumer has specified output requirements that native
  Markdown cannot meet. Defer it until those requirements exist.
- Expanding the existing flat Markdown renderer into a complete renderer would
  make Edge Kit responsible for Notion block-format changes. Native Markdown
  handles the default content path, while block-tree access permits custom work.
- An ingestion-specific, read-only core would constrain editing and automation
  use cases. Restrictions and synchronization belong in optional adapters or
  consumers.
- An unofficial Notion client would introduce a different API and authentication
  contract. Keep the official integration API as the service foundation.

## Constraints

- Keep the module usable through direct file imports with minimal dependencies.
  Do not add barrel files or require an ingestion framework.
- Preserve SDK configuration and query flexibility. Do not reduce general data
  source queries to timestamp filters.
- Do not pass a database ID into a `data_source_id` field or select the first of
  multiple data sources without caller input.
- Keep a single retry owner. Callers that use a retrying custom transport must
  disable SDK retries. Document ownership when injecting an existing client.
- Do not describe native Notion Markdown as portable Markdown or conceal
  truncation and unknown-content metadata in the primary content API.
- Guard pagination against malformed list envelopes and repeated cursors.
  Validate the fields on which the wrapper relies without rebuilding the SDK's
  full response schemas.
- Bound block-tree fetch concurrency and reject cycles. Do not quietly discard
  descendants when a complete tree was requested. Enforce depth and block-count
  limits during fetching; do not collect an unbounded tree before checking them.
- Preserve the typed `getProperty` and `getPropertyValue` helpers.
- Keep persistence, checkpoint storage, and deletion reconciliation outside the
  general client. Make stateless change queries and read-only restrictions
  optional. Enforce read-only restrictions at the request boundary and reject
  combining that policy with an injected SDK client. Direct SDK calls through
  `.client` must pass through the same managed transport policy.
- Do not advance change-query checkpoints using partial pages, non-page results,
  or invalid edit timestamps. Reject filter combinations that would exceed
  Notion's supported compound-filter nesting when adding `since`.

## Consequences

The service reuses official API coverage, native content operations, and SDK
types. Simple calls remain short, while custom transports and raw SDK access
support advanced consumers and credential-free tests.

Consumers that need ordinary Markdown must account for Notion's format or supply
a converter. SDK upgrades can change types or supported API versions, so the
wrapper still needs focused compatibility tests. Injected SDK clients cannot
inherit wrapper-owned transport controls without replacing their configuration.

The flat `notionBlocksToMarkdown` renderer and the Martian conversion dependency
are removed. Consumers of that static renderer must migrate to native Markdown
retrieval or use block-tree output with their own converter. The module does not
include a portable Markdown renderer or durable synchronization.

Native Markdown retrieval reports truncation and unknown content without
automatically fetching missing subtrees. Its `complete` flag reflects the
provider metadata and unknown placeholders, not an independent content audit.
Block-tree limits reject the whole read; they do not return partial trees.
Concurrent batching bounds requests but waits for each batch before scheduling
the next one.

Read-only restrictions also cover direct calls on the managed `.client` object.
The allowlist permits GET reads and only search and data source queries via POST.
New read endpoints need an allowlist update. This is a client request policy;
applications still control their integration credentials and permissions.

Change queries use an inclusive timestamp bound and ascending edit order.
Consumers must replay and deduplicate timestamp ties, persist a checkpoint only
after processing results, and compare full identifier sets periodically to detect
removals or lost access. Queries with partial results cannot produce a reliable
checkpoint and fail. Adding `since` to an OR filter that already contains nested
groups fails with `unsupported_filter`; callers can use `queryDataSource` with
their own valid timestamp filter.

## Assumptions and defaults

- Managed clients default to Notion API version `2026-03-11`; SDK options can
  override it. The implementation uses SDK 5.26.0.
- Managed fetch attempts have a 350 ms minimum interval by default, including
  retries. `pacing` can change the interval, add a per-minute limit, or disable
  pacing. Independent clients have independent pacing state.
- SDK retry behavior remains configurable through SDK options. Injected SDK
  clients own their API version, fetch implementation, retry policy, and pacing.
- `getPageMarkdown` returns incomplete content with diagnostics by default;
  `onIncomplete: 'throw'` rejects it. The deprecated `getPageContent` always uses
  that strict policy.
- Block-tree reads default to 100 results per request, 3 concurrent requests,
  25 levels, and 10,000 blocks. All bounds are configurable; exceeding a bound
  rejects the read. Linked pages and databases remain references.
- Change queries return `highWaterTimestamp: null` when no results exist.
- Wrapper-detected failures use `NotionError` codes. Provider failures retain
  the SDK's error types.

## Public API and contract changes

The existing API-key constructor stays available as
`new NotionClient(token, options?)`. `new NotionClient({ client })` accepts an
existing SDK client without module mocks.

Page content retrieval uses native Notion Markdown in place of the lossy flat
block renderer. A structured Markdown response exposes completeness information;
the deprecated string convenience method rejects incomplete content by default.
Page creation and updates accept native Markdown with explicit SDK parent types.
`getPageMarkdown` preserves the native response and adds `complete`,
`incompleteReasons`, and `unknownBlockIds`. The static
`notionBlocksToMarkdown` method is removed; rich-text and property helpers remain.

Data source operations name the identifier they accept. Database resolution is a
separate operation that rejects ambiguity. Compatibility aliases must document
their historical identifier semantics rather than silently reinterpret IDs.
`queryDatabase` still accepts a data source ID, and `getDatabases` still returns
data source summaries. Both are deprecated. The positional `createPage` overload
retains its database-parent semantics; the options form accepts SDK parent types.

Callers can fetch a block tree or iterate query results without depending on a
Markdown converter. Optional read-only mode selects a request policy and rejects
an injected SDK client. A stateless change-query helper returns edited results
and checkpoint information. Existing property extraction stays typed, and raw SDK
access remains available.

## Related ADRs

- [ADR-0002](0002-add-contextualizer-richer-storage-and-ai-runtime-support.md)
  establishes separate concerns and copy-paste-friendly module boundaries.
- [ADR-0023](0023-use-a-dedicated-deep-research-service-for-gemini-interactions-api-agents.md)
  chooses raw REST for Gemini Deep Research. That provider-specific choice does
  not require replacing the existing Notion SDK.
