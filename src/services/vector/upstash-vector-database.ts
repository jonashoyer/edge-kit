import { Index } from "@upstash/vector";
import { AbstractVectorDatabase, VectorDatabaseOptions, VectorEntry, VectorQueryOptions } from './abstract-vector-database';

interface UpstashVectorOptions extends VectorDatabaseOptions {
  url: string;
  token: string;
}

export class UpstashVectorDatabase<TMetadata = Record<string, any>> extends AbstractVectorDatabase<TMetadata, number[]> {
  private client: Index;

  constructor(options: UpstashVectorOptions) {
    super(options);
    this.client = new Index({
      url: options.url,
      token: options.token,
    });
  }

  async upsert(namespace: string, entries: VectorEntry<number[], TMetadata, true>[]): Promise<void> {
    await this.client.upsert(
      entries.map(entry => ({
        id: entry.id,
        vector: entry.vector,
        metadata: entry.metadata,
      })),
      { namespace },
    );
  }

  async query<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    vector: number[],
    topK: number,
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<VectorEntry<number[], TMetadata, TIncludeVectors>[]> {
    const results = await this.client.query({
      vector,
      topK,
      includeVectors: opts?.includeVectors,
      includeMetadata: opts?.includeMetadata,
    }, { namespace });

    return results.map((result: any) => ({
      id: result.id,
      vector: opts?.includeVectors ? result.vector : undefined,
      metadata: opts?.includeMetadata ? result.metadata : undefined,
    })) as VectorEntry<number[], TMetadata, TIncludeVectors>[];
  }

  async delete(namespace: string, ids: string[]): Promise<void> {
    await this.client.delete(ids, { namespace });
  }

  async list<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    ids: string[],
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<(VectorEntry<number[], TMetadata, TIncludeVectors, TIncludeMetadata> | null)[]> {
    const results = await this.client.fetch(ids, {
      includeVectors: opts?.includeVectors,
      includeMetadata: opts?.includeMetadata,
      namespace,
    });

    return results.map(e => {
      if (!e) return null;
      return {
        id: e.id,
        vector: opts?.includeVectors ? e.vector : undefined,
        metadata: opts?.includeMetadata ? e.metadata : undefined,
      }
    }) as (VectorEntry<number[], TMetadata, TIncludeVectors, TIncludeMetadata> | null)[];
  }
}
