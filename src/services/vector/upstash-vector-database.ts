import { Index } from '@upstash/vector';

import {
  AbstractVectorDatabase,
  type VectorDatabaseOptions,
  type VectorEntry,
  type VectorQueryOptions,
} from './abstract-vector-database';

interface UpstashVectorOptions extends VectorDatabaseOptions {
  token: string;
  url: string;
}

/**
 * Upstash Vector implementation of AbstractVectorDatabase.
 * Uses the `@upstash/vector` client for serverless vector storage and retrieval.
 * @deprecated Use `UpstashVector` from `@mastra/upstash` instead
 */
export class UpstashVectorDatabase<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> extends AbstractVectorDatabase<TMetadata, number[]> {
  private readonly client: Index<Record<string, unknown>>;

  constructor(options: UpstashVectorOptions) {
    super(options);
    this.client = new Index<Record<string, unknown>>({
      token: options.token,
      url: options.url,
    });
  }

  async upsert(
    namespace: string,
    entries: VectorEntry<number[], TMetadata, true, true>[]
  ): Promise<void> {
    await this.client.upsert(
      entries.map((entry) => ({
        id: entry.id,
        metadata: entry.metadata,
        vector: entry.vector,
      })),
      { namespace }
    );
  }

  async query<
    TIncludeVectors extends boolean,
    TIncludeMetadata extends boolean,
  >(
    namespace: string,
    vector: number[],
    topK: number,
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<
    VectorEntry<number[], TMetadata, TIncludeVectors, TIncludeMetadata>[]
  > {
    const results = await this.client.query(
      {
        includeMetadata: opts?.includeMetadata,
        includeVectors: opts?.includeVectors,
        topK,
        vector,
      },
      { namespace }
    );

    return results.map((result) => ({
      id: String(result.id),
      metadata: opts?.includeMetadata ? result.metadata : undefined,
      vector: opts?.includeVectors ? result.vector : undefined,
    })) as VectorEntry<
      number[],
      TMetadata,
      TIncludeVectors,
      TIncludeMetadata
    >[];
  }

  async delete(namespace: string, ids: string[]): Promise<void> {
    await this.client.delete(ids, { namespace });
  }

  async list<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    ids: string[],
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<
    (VectorEntry<
      number[],
      TMetadata,
      TIncludeVectors,
      TIncludeMetadata
    > | null)[]
  > {
    const results = await this.client.fetch(ids, {
      includeMetadata: opts?.includeMetadata,
      includeVectors: opts?.includeVectors,
      namespace,
    });

    return results.map((e) => {
      if (!e) {
        return null;
      }
      return {
        id: String(e.id),
        metadata: opts?.includeMetadata ? e.metadata : undefined,
        vector: opts?.includeVectors ? e.vector : undefined,
      };
    }) as (VectorEntry<
      number[],
      TMetadata,
      TIncludeVectors,
      TIncludeMetadata
    > | null)[];
  }
}
