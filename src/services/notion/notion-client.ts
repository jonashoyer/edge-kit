import {
  Client,
  type CreatePageParameters,
  type CreatePageResponse,
  type GetDatabaseResponse,
  type GetPageParameters,
  isFullPage,
  type PageObjectResponse,
  type QueryDataSourceParameters,
  type QueryDataSourceResponse,
  type RichTextItemResponse,
  type SearchParameters,
  type SearchResponse,
} from '@notionhq/client';
import type {
  GetPageMarkdownParameters,
  GetPageMarkdownResponse,
  UpdatePageMarkdownParameters,
  UpdatePageMarkdownResponse,
} from '@notionhq/client/build/src/api-endpoints/pages';
import {
  type GetPageBlocksOptions,
  type NotionBlockTreeNode,
  readNotionBlockTree,
} from './notion-blocks';
import { NotionError } from './notion-errors';
import {
  isNonemptyString,
  isRecord,
  iterateNotionList,
} from './notion-pagination';
import {
  createNotionFetch,
  type NotionClientOptions,
} from './notion-transport';

const DEFAULT_NOTION_VERSION = '2026-03-11';
const UNKNOWN_PLACEHOLDER_PATTERN = /<unknown\b/i;

type NotionObject = SearchResponse['results'][number];
type NotionPageProperties = NonNullable<CreatePageParameters['properties']>;
/** Native SDK page creation options, including Markdown or structured children. */
export type NotionCreatePageOptions = CreatePageParameters;

type WithoutPageId<T> = T extends { page_id: string }
  ? Omit<T, 'page_id'>
  : never;
/** Preserves the SDK's discriminated union of Markdown edit operations. */
export type NotionUpdateMarkdownOptions =
  WithoutPageId<UpdatePageMarkdownParameters>;
export type QueryDataSourceOptions = Omit<
  QueryDataSourceParameters,
  'data_source_id'
>;
export type QueryDataSourceChangesOptions = Omit<
  QueryDataSourceOptions,
  'sorts'
> & {
  since?: string | Date;
};
export type GetPageMarkdownOptions = Omit<
  GetPageMarkdownParameters,
  'page_id'
> & {
  onIncomplete?: 'return' | 'throw';
};
type InjectedNotionClientOptions = { client: Client; readOnly?: false };

type PropertyTypes = PageObjectResponse['properties'][string]['type'];

type PropertyTypeToObject = {
  [K in PropertyTypes]: Extract<
    PageObjectResponse['properties'][string],
    { type: K }
  >;
};

type PropertyTypeToValue = {
  [K in PropertyTypes]: Extract<
    PageObjectResponse['properties'][string],
    { type: K }
  > extends Record<K, infer V>
    ? V
    : never;
};

type RichTextTypes = 'title' | 'rich_text';
type PropertyValueReturn<T extends PropertyTypes> = T extends RichTextTypes
  ? string
  : PropertyTypeToValue[T];

type QueryDatabaseFilterAnd = Extract<
  QueryDataSourceParameters['filter'],
  { and: unknown }
>['and'];

export type NotionDataSourceSummary = {
  id: string;
  databaseId: string | null;
  icon: string | null;
  inTrash: boolean;
  archived: boolean;
  name: string | null;
  pageId: string | null;
};

/** @deprecated Use `NotionDataSourceSummary`; this type has always described queryable data sources. */
export type NotionDatabase = NotionDataSourceSummary;

export type NotionMarkdownResult = GetPageMarkdownResponse & {
  complete: boolean;
  incompleteReasons: Array<
    'truncated' | 'unknown_block_ids' | 'unknown_placeholders'
  >;
  unknownBlockIds: string[];
};

export type NotionQueryChangesResult = {
  results: QueryDataSourceResponse['results'];
  highWaterTimestamp: string | null;
};

/**
 * SDK-first Notion service wrapper with a small copy-paste-friendly DX layer.
 *
 * It keeps the official SDK available as `.client`, adds guarded pagination,
 * optional fetch-bound read-only enforcement, native Markdown helpers, and typed
 * property utilities. By default it uses the SDK retry implementation and wraps
 * each actual fetch attempt with serialized pacing (~350ms spacing).
 *
 * @example
 * const notion = new NotionClient(process.env.NOTION_TOKEN!);
 * const page = await notion.createPage({
 *   parent: { data_source_id: 'source-id' },
 *   properties: { Name: { title: [{ text: { content: 'Hello' } }] } },
 *   markdown: '# Hello',
 * });
 */
export class NotionClient {
  readonly client: Client;

  constructor(apiKey: string, options?: NotionClientOptions);
  constructor(options: InjectedNotionClientOptions);
  constructor(
    apiKeyOrOptions: string | InjectedNotionClientOptions,
    options: NotionClientOptions = {}
  ) {
    if (typeof apiKeyOrOptions !== 'string') {
      if (apiKeyOrOptions.readOnly) {
        throw new NotionError(
          'readOnly requires a managed SDK client',
          'invalid_configuration'
        );
      }
      this.client = apiKeyOrOptions.client;
      return;
    }

    const { pacing: _pacing, readOnly: _readOnly, ...sdkOptions } = options;
    this.client = new Client({
      ...sdkOptions,
      auth: apiKeyOrOptions,
      fetch: createNotionFetch(options),
      notionVersion: sdkOptions.notionVersion ?? DEFAULT_NOTION_VERSION,
    });
  }

  /**
   * Creates a page using the official SDK's native Markdown field.
   */
  createPage(options: NotionCreatePageOptions): Promise<CreatePageResponse>;
  /**
   * @deprecated Use `createPage({ parent, properties, markdown })`. The first
   * argument is still treated as a legacy database id for compatibility.
   */
  createPage(
    databaseId: string,
    properties: NotionPageProperties,
    markdown?: string
  ): Promise<CreatePageResponse>;
  createPage(
    optionsOrDatabaseId: NotionCreatePageOptions | string,
    properties?: NotionPageProperties,
    markdown?: string
  ): Promise<CreatePageResponse> {
    if (typeof optionsOrDatabaseId === 'string') {
      return this.client.pages.create({
        parent: { database_id: optionsOrDatabaseId },
        properties,
        markdown,
      });
    }

    return this.client.pages.create(optionsOrDatabaseId);
  }

  /**
   * Updates a page with the SDK's native Markdown operations.
   */
  updatePageMarkdown(
    pageId: string,
    options: NotionUpdateMarkdownOptions
  ): Promise<UpdatePageMarkdownResponse> {
    return this.client.pages.updateMarkdown({ ...options, page_id: pageId });
  }

  /**
   * @deprecated Prefer `iterateDataSource` or `queryDataSource` for guarded SDK pagination.
   */
  async recursiveCall<T>(
    fn: (cursor?: string) => Promise<{ data: T; cursor?: string | null }>,
    startCursor?: string
  ): Promise<T[]> {
    const pages: T[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined = startCursor;

    while (true) {
      if (cursor) {
        if (seenCursors.has(cursor))
          throw new NotionError(
            'Repeated cursor in recursiveCall',
            'repeated_cursor'
          );
        seenCursors.add(cursor);
      }
      const response = await fn(cursor);
      pages.push(response.data);
      if (!response.cursor) {
        return pages;
      }
      cursor = response.cursor;
    }
  }

  /** Retrieves page metadata; use getPageMarkdown or getPageBlocks for content. */
  getPage(pageId: string, options?: Omit<GetPageParameters, 'page_id'>) {
    return this.client.pages.retrieve({ ...options, page_id: pageId });
  }

  /**
   * Retrieves native Notion Markdown and returns visible completeness metadata.
   */
  async getPageMarkdown(
    pageId: string,
    options: GetPageMarkdownOptions = {}
  ): Promise<NotionMarkdownResult> {
    const { onIncomplete = 'return', ...sdkOptions } = options;
    const response = await this.client.pages.retrieveMarkdown({
      ...sdkOptions,
      page_id: pageId,
    });
    const result = toMarkdownResult(response);

    if (!result.complete && onIncomplete === 'throw') {
      throw new NotionError(
        `Notion markdown for page ${pageId} is incomplete: ${result.incompleteReasons.join(', ')}`,
        'incomplete_content'
      );
    }

    return result;
  }

  /**
   * @deprecated Use `getPageMarkdown` so callers can inspect completeness. This
   * convenience is strict by default and throws on truncated or unknown content.
   */
  async getPageContent(pageId: string) {
    const result = await this.getPageMarkdown(pageId, {
      onIncomplete: 'throw',
    });
    return result.markdown;
  }

  /**
   * Lists queryable data sources with source ids and the parent database id when available.
   */
  async getDataSources(
    options: Omit<SearchParameters, 'filter'> = {}
  ): Promise<NotionDataSourceSummary[]> {
    const dataSources: NotionDataSourceSummary[] = [];

    for await (const source of this.iterateSearch({
      ...options,
      filter: { property: 'object', value: 'data_source' },
    })) {
      dataSources.push(toDataSourceSummary(source));
    }

    return dataSources;
  }

  /** @deprecated Use `getDataSources`; this method returns data sources, not databases. */
  getDatabases(cursor?: string | null): Promise<NotionDatabase[]> {
    if (cursor === null) {
      return Promise.resolve([]);
    }
    return this.getDataSources({ start_cursor: cursor });
  }

  /** Retrieves the database container, including its available data sources. */
  getDatabase(databaseId: string): Promise<GetDatabaseResponse> {
    return this.client.databases.retrieve({ database_id: databaseId });
  }

  /**
   * Resolves a database id to its single queryable data source id.
   */
  async resolveDataSourceId(databaseId: string): Promise<string> {
    const database: unknown = await this.getDatabase(databaseId);
    if (
      !isRecord(database) ||
      database.object !== 'database' ||
      !isNonemptyString(database.id) ||
      !Array.isArray(database.data_sources) ||
      !database.data_sources.every(
        (source) => isRecord(source) && isNonemptyString(source.id)
      )
    ) {
      throw new NotionError(
        `Database ${databaseId} returned invalid data_sources`,
        'invalid_response'
      );
    }
    if (database.data_sources.length === 0)
      throw new NotionError(
        `Database ${databaseId} has no data sources`,
        'missing_data_source'
      );
    if (database.data_sources.length > 1)
      throw new NotionError(
        `Database ${databaseId} has multiple data sources; select a dataSourceId`,
        'ambiguous_data_source'
      );
    return database.data_sources[0].id;
  }

  /**
   * Queries a data source and collects all pages with guarded cursor pagination.
   */
  async queryDataSource(
    dataSourceId: string,
    options: QueryDataSourceOptions = {}
  ): Promise<QueryDataSourceResponse['results']> {
    const results: QueryDataSourceResponse['results'] = [];
    for await (const page of this.iterateDataSource(dataSourceId, options)) {
      results.push(page);
    }
    return results;
  }

  /**
   * Streams data source query results page-by-page with runtime cursor validation.
   */
  async *iterateDataSource(
    dataSourceId: string,
    options: QueryDataSourceOptions = {}
  ): AsyncGenerator<QueryDataSourceResponse['results'][number]> {
    for await (const results of iterateNotionList(
      (cursor) =>
        this.client.dataSources.query({
          ...options,
          data_source_id: dataSourceId,
          start_cursor: cursor,
        }),
      isQueryResult,
      options.start_cursor
    )) {
      yield* results;
    }
  }

  /**
   * @deprecated Despite the name, this historically accepts a data source id.
   * Use `queryDataSource(dataSourceId, options)` or `resolveDataSourceId(databaseId)` explicitly.
   */
  queryDatabase(
    databaseId: string,
    options?: {
      startEditedTime?: string | Date | null;
      lastEditedTime?: string | Date | null;
      filter?: QueryDatabaseFilterAnd;
      cursor?: string;
    }
  ): Promise<QueryDataSourceResponse['results']> {
    const startEditedTime = options?.startEditedTime
      ? new Date(options.startEditedTime).toISOString()
      : undefined;
    const endEditedTime = options?.lastEditedTime
      ? new Date(options.lastEditedTime).toISOString()
      : undefined;

    const filters = [
      ...createEditedTimeFilters(startEditedTime, endEditedTime),
      ...(options?.filter ?? []),
    ];
    return this.queryDataSource(databaseId, {
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      start_cursor: options?.cursor,
    });
  }

  /**
   * Queries changes with an inclusive lower bound and ascending last edit order.
   * Persist checkpoints only after processing results, replay/dedupe timestamp
   * ties, and run periodic full id diffs to detect removals or permission loss.
   */
  async queryDataSourceChanges(
    dataSourceId: string,
    options: QueryDataSourceChangesOptions = {}
  ): Promise<NotionQueryChangesResult> {
    const since = options.since
      ? new Date(options.since).toISOString()
      : undefined;
    const { since: _since, ...sdkOptions } = options;
    const queryOptions: QueryDataSourceOptions = {
      ...sdkOptions,
      filter: withLastEditedLowerBound(options.filter, since),
      sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
    };
    const results = await this.queryDataSource(dataSourceId, queryOptions);
    const highWaterTimestamp = getHighWaterTimestamp(results);

    return { results, highWaterTimestamp };
  }

  /**
   * Fetches the full block tree below a page or block id. It follows `has_children`
   * blocks only; it does not crawl linked pages or databases.
   */
  async getPageBlocks(
    pageId: string,
    options: GetPageBlocksOptions = {}
  ): Promise<NotionBlockTreeNode[]> {
    return await readNotionBlockTree(this.client, pageId, options);
  }

  static extractIcon(obj: NotionObject) {
    if (!('icon' in obj && obj.icon)) {
      return null;
    }

    if (obj.icon.type === 'emoji') {
      return obj.icon.emoji;
    }

    if (obj.icon.type === 'file') {
      return obj.icon.file.url;
    }

    if (obj.icon.type === 'external') {
      return obj.icon.external.url;
    }

    if (obj.icon.type === 'custom_emoji') {
      return obj.icon.custom_emoji.url;
    }

    return null;
  }

  static uuidToId(uuid: string) {
    return uuid.replace(/-/g, '');
  }

  /** Returns a named page property only when its SDK type matches. */
  static getProperty<TType extends keyof PropertyTypeToObject>(
    obj: NotionObject,
    type: TType,
    property: string
  ): PropertyTypeToObject[TType] | null {
    if (obj.object !== 'page') {
      return null;
    }

    const prop = 'properties' in obj ? obj.properties?.[property] : null;
    return prop?.type === type ? (prop as PropertyTypeToObject[TType]) : null;
  }

  /** Extracts a typed property value, rendering title and rich_text as Markdown. */
  static getPropertyValue<TType extends PropertyTypes>(
    obj: NotionObject,
    type: TType,
    property: string
  ): PropertyValueReturn<TType> | null {
    const prop = NotionClient.getProperty(obj, type, property);
    if (!(prop && type in prop)) {
      return null;
    }

    const value = prop[type as keyof typeof prop];
    const isRichText = type === 'title' || type === 'rich_text';

    if (isRichText && Array.isArray(value)) {
      return NotionClient.notionRichTextToMarkdown(
        value
      ) as PropertyValueReturn<TType>;
    }

    return value as PropertyValueReturn<TType>;
  }

  /** Retrieves the integration bot associated with the current credentials. */
  getUserSelf() {
    return this.client.users.me({});
  }

  static applyAnnotations(
    text: string,
    annotation: RichTextItemResponse['annotations']
  ) {
    const { bold, code, italic, strikethrough, underline, color } = annotation;
    let formattedText = text;

    if (bold) {
      formattedText = `**${formattedText}**`;
    }
    if (code) {
      formattedText = `\`${formattedText}\``;
    }
    if (italic) {
      formattedText = `*${formattedText}*`;
    }
    if (strikethrough) {
      formattedText = `~~${formattedText}~~`;
    }
    if (underline) {
      formattedText = `<ins>${formattedText}</ins>`;
    }
    if (color !== 'default') {
      formattedText = `==${formattedText}==`;
    }

    return formattedText;
  }

  static notionRichTextToMarkdown(richText: RichTextItemResponse[]) {
    return richText
      .map((item) =>
        NotionClient.applyAnnotations(richTextContent(item), item.annotations)
      )
      .join('');
  }

  private async *iterateSearch(
    options: SearchParameters
  ): AsyncGenerator<SearchResponse['results'][number]> {
    for await (const results of iterateNotionList(
      (cursor) => this.client.search({ ...options, start_cursor: cursor }),
      isQueryResult,
      options.start_cursor
    )) {
      yield* results;
    }
  }
}

const toMarkdownResult = (
  response: GetPageMarkdownResponse
): NotionMarkdownResult => {
  if (
    !isRecord(response) ||
    response.object !== 'page_markdown' ||
    !isNonemptyString(response.id) ||
    typeof response.markdown !== 'string' ||
    typeof response.truncated !== 'boolean' ||
    !Array.isArray(response.unknown_block_ids) ||
    !response.unknown_block_ids.every(isNonemptyString)
  ) {
    throw new NotionError(
      'Invalid Notion Markdown response',
      'invalid_response'
    );
  }
  const incompleteReasons: NotionMarkdownResult['incompleteReasons'] = [];
  if (response.truncated) {
    incompleteReasons.push('truncated');
  }
  if (response.unknown_block_ids.length > 0) {
    incompleteReasons.push('unknown_block_ids');
  }
  if (UNKNOWN_PLACEHOLDER_PATTERN.test(response.markdown)) {
    incompleteReasons.push('unknown_placeholders');
  }

  return {
    ...response,
    complete: incompleteReasons.length === 0,
    incompleteReasons,
    unknownBlockIds: response.unknown_block_ids,
  };
};

const isQueryResult = (
  value: unknown
): value is QueryDataSourceResponse['results'][number] =>
  isRecord(value) &&
  isNonemptyString(value.id) &&
  (value.object === 'page' || value.object === 'data_source');

const toDataSourceSummary = (source: SearchResponse['results'][number]) => {
  const databaseId =
    'parent' in source && source.parent.type === 'database_id'
      ? source.parent.database_id
      : null;

  return {
    archived: 'in_trash' in source ? source.in_trash : false,
    databaseId,
    icon: NotionClient.extractIcon(source),
    id: source.id,
    inTrash: 'in_trash' in source ? source.in_trash : false,
    name:
      'title' in source
        ? source.title
            .map((title) => ('plain_text' in title ? title.plain_text : ''))
            .join('')
        : null,
    pageId:
      'database_parent' in source && source.database_parent.type === 'page_id'
        ? source.database_parent.page_id
        : null,
  } satisfies NotionDataSourceSummary;
};

const createEditedTimeFilters = (start?: string, end?: string) => {
  const filters: QueryDatabaseFilterAnd = [];
  if (start) {
    filters.push({
      last_edited_time: { on_or_after: start },
      timestamp: 'last_edited_time',
    });
  }
  if (end) {
    filters.push({
      last_edited_time: { on_or_before: end },
      timestamp: 'last_edited_time',
    });
  }
  return filters;
};

const withLastEditedLowerBound = (
  filter: QueryDataSourceParameters['filter'] | undefined,
  since: string | undefined
): QueryDataSourceParameters['filter'] | undefined => {
  if (!since) {
    return filter;
  }

  const editedFilter = {
    last_edited_time: { on_or_after: since },
    timestamp: 'last_edited_time' as const,
  };

  if (!filter) {
    return editedFilter;
  }

  if ('and' in filter) return { and: [...filter.and, editedFilter] };
  if ('or' in filter) {
    // Adding an AND outside nested groups would exceed Notion's two-level limit.
    if (filter.or.some((child) => 'and' in child || 'or' in child)) {
      throw new NotionError(
        'since cannot be combined with a nested OR filter; use queryDataSource with an explicit timestamp filter',
        'unsupported_filter'
      );
    }
    const terms = filter.or.filter(
      (
        child
      ): child is Exclude<typeof child, { and: unknown } | { or: unknown }> =>
        !('and' in child || 'or' in child)
    );
    return { and: [{ or: terms }, editedFilter] };
  }
  return { and: [filter, editedFilter] };
};

const getHighWaterTimestamp = (
  results: QueryDataSourceResponse['results']
): string | null => {
  let latest: number | null = null;
  for (const result of results) {
    if (
      !(isFullPage(result) && 'last_edited_time' in result) ||
      typeof result.last_edited_time !== 'string'
    ) {
      throw new NotionError(
        'Cannot checkpoint a query containing partial pages or data sources',
        'invalid_response'
      );
    }
    const timestamp = Date.parse(result.last_edited_time);
    if (!Number.isFinite(timestamp))
      throw new NotionError(
        'Invalid last_edited_time in query result',
        'invalid_response'
      );
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest === null ? null : new Date(latest).toISOString();
};

const richTextContent = (item: RichTextItemResponse): string => {
  switch (item.type) {
    case 'text':
      if (item.text.link) {
        return `[${item.text.content}](${item.text.link.url})`;
      }
      return item.text.content;
    case 'equation':
      return `$${item.equation.expression}$`;
    case 'mention':
      if (item.mention.type === 'user')
        return `@${'name' in item.mention.user ? item.mention.user.name : item.mention.user.id}`;
      return item.plain_text;
    default:
      return '';
  }
};
