import type { BlockObjectResponse, Client } from '@notionhq/client';
import { NotionError } from './notion-errors';
import {
  isNonemptyString,
  isRecord,
  validateNotionList,
} from './notion-pagination';

/** Bounds apply to one complete tree read. Exceeding a bound rejects the read. */
export type GetPageBlocksOptions = {
  page_size?: number;
  maxBlocks?: number;
  maxConcurrency?: number;
  maxDepth?: number;
};

/** Raw SDK block plus its fetched descendants, in Notion's original order. */
export type NotionBlockTreeNode = {
  id: string;
  type: BlockObjectResponse['type'];
  block: BlockObjectResponse;
  children: NotionBlockTreeNode[];
};

const HYPHENS = /-/g;

type ChildRead = {
  blockId: string;
  depth: number;
  path: Set<string>;
  output: NotionBlockTreeNode[];
  cursor: string | null;
  seenCursors: Set<string>;
};

/** Fetches a bounded tree; linked pages and databases are not crawled. */
export async function readNotionBlockTree(
  client: Client,
  pageId: string,
  options: GetPageBlocksOptions = {}
): Promise<NotionBlockTreeNode[]> {
  const maxDepth = options.maxDepth ?? 25;
  const maxBlocks = options.maxBlocks ?? 10_000;
  const maxConcurrency = options.maxConcurrency ?? 3;
  const pageSize = options.page_size ?? 100;
  for (const [name, value] of Object.entries({
    maxBlocks,
    maxConcurrency,
    maxDepth,
    pageSize,
  })) {
    if (
      !Number.isInteger(value) ||
      value < 1 ||
      (name === 'pageSize' && value > 100)
    ) {
      throw new NotionError(
        `${name} must be a positive integer${name === 'pageSize' ? ' at most 100' : ''}`,
        'invalid_configuration'
      );
    }
  }
  const roots: NotionBlockTreeNode[] = [];
  const queue: ChildRead[] = [
    {
      blockId: pageId,
      cursor: null,
      depth: 1,
      output: roots,
      path: new Set([canonicalId(pageId)]),
      seenCursors: new Set(),
    },
  ];
  let count = 0;
  let failed = false;
  // A batch bounds requests without holding permits while descendants are read.
  const fetchChildren = async (task: ChildRead): Promise<void> => {
    if (failed) return;
    if (count >= maxBlocks)
      throw new NotionError(
        `Notion block tree exceeded maxBlocks ${maxBlocks}`,
        'block_limit'
      );
    const response = await client.blocks.children.list({
      block_id: task.blockId,
      page_size: Math.min(pageSize, maxBlocks - count),
      start_cursor: task.cursor,
    });
    if (failed) return;
    const page = validateNotionList(response, isFullBlock);
    if (page.next_cursor && task.seenCursors.has(page.next_cursor)) {
      throw new NotionError(
        'Repeated cursor in Notion block children',
        'repeated_cursor'
      );
    }
    count += page.results.length;
    if (count > maxBlocks || (count === maxBlocks && page.has_more)) {
      throw new NotionError(
        `Notion block tree exceeded maxBlocks ${maxBlocks}`,
        'block_limit'
      );
    }
    for (const block of page.results) {
      appendBlock(block, task, queue, maxDepth);
    }
    if (page.has_more && page.next_cursor) {
      task.seenCursors.add(page.next_cursor);
      queue.push({ ...task, cursor: page.next_cursor });
    }
  };
  while (queue.length > 0) {
    const batch = queue.splice(0, maxConcurrency);
    // biome-ignore lint/performance/noAwaitInLoops: Each batch respects the configured concurrency limit and adds discovered children to the queue.
    const results = await Promise.allSettled(
      batch.map(async (task) => {
        try {
          await fetchChildren(task);
        } catch (error) {
          failed = true;
          throw error;
        }
      })
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
  }
  return roots;
}

function canonicalId(id: string): string {
  return id.replace(HYPHENS, '').toLowerCase();
}

function addToPath(path: Set<string>, id: string): void {
  const canonical = canonicalId(id);
  if (path.has(canonical))
    throw new NotionError(
      `Cycle detected at Notion block ${id}`,
      'block_cycle'
    );
  path.add(canonical);
}

function syncedSource(block: BlockObjectResponse): string | null {
  if (block.type !== 'synced_block') return null;
  const source = block.synced_block.synced_from;
  if (source === null) return null;
  if (!(isRecord(source) && isNonemptyString(source.block_id))) {
    throw new NotionError('Invalid synced block reference', 'invalid_response');
  }
  return source.block_id;
}

function isFullBlock(value: unknown): value is BlockObjectResponse {
  return (
    isRecord(value) &&
    value.object === 'block' &&
    isNonemptyString(value.id) &&
    isNonemptyString(value.type) &&
    typeof value.has_children === 'boolean' &&
    isRecord(value[value.type])
  );
}

function appendBlock(
  block: BlockObjectResponse,
  task: ChildRead,
  queue: ChildRead[],
  maxDepth: number
): void {
  const path = new Set(task.path);
  addToPath(path, block.id);
  const syncedFrom = syncedSource(block);
  if (syncedFrom) addToPath(path, syncedFrom);
  const node: NotionBlockTreeNode = {
    block,
    children: [],
    id: block.id,
    type: block.type,
  };
  task.output.push(node);
  const hasChildren = block.has_children || syncedFrom !== null;
  if (
    hasChildren &&
    block.type !== 'child_page' &&
    block.type !== 'child_database'
  ) {
    if (task.depth >= maxDepth)
      throw new NotionError(
        `Notion block tree exceeded maxDepth ${maxDepth}`,
        'block_limit'
      );
    queue.push({
      blockId: syncedFrom ?? block.id,
      cursor: null,
      depth: task.depth + 1,
      output: node.children,
      path,
      seenCursors: new Set(),
    });
  }
}
