import { Search } from "@upstash/search";
import type { VectorEntry } from "../vector/abstract-vector-database";
import {
  AbstractRetriever,
  type ChunkedDocumentMeta,
  type RetrieverQueryOptions,
} from "./abstract-retriever";

export type UpstashSearchContent = Record<string, unknown>;

export type SearchIndex<
  TContent extends UpstashSearchContent = UpstashSearchContent,
  TMeta extends ChunkedDocumentMeta = ChunkedDocumentMeta,
> = ReturnType<typeof Search.prototype.index<TContent, TMeta>>;

export type UpstashSearchServiceOptions = {
  url?: string;
  token?: string;
  /** Index name in Upstash Search */
  index: string;
};

export type UpstashSearchMetadata = ChunkedDocumentMeta;
export type UpstashSearchDocument<
  TContent extends UpstashSearchContent = UpstashSearchContent,
  TMeta extends UpstashSearchMetadata = UpstashSearchMetadata,
> = {
  id: string;
  content: TContent;
  metadata?: TMeta;
};

export type UpstashSearchQueryOptions = {
  limit?: number; // default defined by Upstash
  reranking?: boolean; // enable semantic + fulltext reranking server-side
};

/**
 * Upstash Search implementation of AbstractRetriever.
 * Uses Upstash's serverless search/vector database for high-performance retrieval.
 * Supports full-text search and metadata filtering.
 */
export class UpstashSearchService<
  TContent extends UpstashSearchContent = UpstashSearchContent,
  TMeta extends ChunkedDocumentMeta = ChunkedDocumentMeta,
> extends AbstractRetriever<TMeta> {
  private readonly client: Search;

  constructor(options: UpstashSearchServiceOptions) {
    super();
    this.client =
      options.url && options.token
        ? new Search({ url: options.url, token: options.token })
        : Search.fromEnv();
  }

  /** Upsert one or many documents */
  async upsert(
    namespace: string,
    chunks: Array<{ id: string; text: string; metadata: TMeta }>
  ): Promise<void> {
    const index = this.client.index<{ text: string }, TMeta>(namespace);
    await index.upsert(
      chunks.map((c) => ({
        id: c.id,
        content: { text: c.text },
        metadata: c.metadata,
      }))
    );
  }

  /** Delete by id(s) */
  async delete(namespace: string, ids: string[]): Promise<void> {
    const index = this.client.index(namespace);
    await index.delete(ids);
  }

  /** Optional helper: Fetch by id(s) */
  async fetch(
    namespace: string,
    ids: string[]
  ): Promise<Array<{ id: string; content: unknown; metadata?: TMeta } | null>> {
    const index = this.client.index<unknown, TMeta>(namespace);
    return await index.fetch(ids);
  }

  /** Query documents with optional server-side reranking. Implements AbstractRetriever.query */
  async query(
    namespace: string,
    query: string,
    options?: RetrieverQueryOptions & { reranking?: boolean }
  ): Promise<VectorEntry<number[], TMeta, false>[]> {
    const index = this.client.index<{ text: string }, TMeta>(namespace);
    const res = await index.search({
      query,
      limit: options?.topK,
      reranking: options?.reranking,
    });

    const mapped = res.map((doc) => ({
      id: doc.id,
      // Upstash Search does not expose vectors; align with VectorEntry shape using conditional generics
      vector: undefined as never,
      metadata: doc.metadata as TMeta,
    }));

    return mapped as VectorEntry<number[], TMeta, false>[];
  }
}
