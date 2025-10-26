import type { VectorEntry } from "../vector/abstract-vector-database";

export interface ChunkedDocumentMeta {
  docId: string;
  source?: string;
  tags?: string[];
  [key: string]: any;
}

export interface RetrieverQueryOptions {
  topK?: number;
  includeVectors?: boolean;
  includeMetadata?: boolean;
}

export interface EmbedderService {
  embed(texts: string[]): Promise<number[][]>;
}

export abstract class AbstractRetriever<
  TMetadata extends ChunkedDocumentMeta = ChunkedDocumentMeta,
> {
  // protected constructor(protected vectorDb: AbstractVectorDatabase<TMetadata, number[]>) { }

  abstract upsert(
    namespace: string,
    chunks: Array<{ id: string; text: string; metadata: TMetadata }>
  ): Promise<void>;

  abstract delete(namespace: string, ids: string[]): Promise<void>;

  abstract query(
    namespace: string,
    query: string,
    options?: RetrieverQueryOptions
  ): Promise<VectorEntry<number[], TMetadata, any>[]>;
}
