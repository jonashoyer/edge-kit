import { embedMany } from 'ai';
import { ContextualizedEmbedder, VoyageContextualizedEmbedder } from './contextualized-embedder';

import type { AbstractVectorDatabase, VectorEntry } from '../vector/abstract-vector-database';
import { SimpleChunker, type Chunk } from './simple-chunker';

export interface RagChunkMetadataBase {
  docId: string;
  source?: string;
  tags?: string[];
  text?: string;
  [key: string]: any;
}

export interface Reranker<TMeta = RagChunkMetadataBase> {
  rerank(query: string, items: Array<{ id: string; text: string; metadata?: TMeta }>, topK?: number): Promise<
    Array<{ id: string; text: string; metadata?: TMeta; score?: number }>
  >;
}

export interface RagServiceOptions<TMeta extends RagChunkMetadataBase = RagChunkMetadataBase> {
  vectorDb: AbstractVectorDatabase<TMeta, number[]>;
  embeddingModel: unknown; // model from AI SDK provider (e.g. voyage.textEmbeddingModel('voyage-3'))
  chunker?: SimpleChunker;
  reranker?: Reranker<TMeta>;
  storeTextInMetadata?: boolean; // default: true (recommended for reranking)
  contextualized?: {
    enabled: boolean; // when true, use Voyage contextualized chunk embeddings API
    apiKey: string;
    model: string; // e.g. 'voyage-context-3'
    baseUrl?: string; // default: https://api.voyageai.com/v1
    outputDimension?: 256 | 512 | 1024 | 2048;
    outputDtype?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary';
  };
}

export interface IndexDocumentOptions<TMeta extends RagChunkMetadataBase = RagChunkMetadataBase> {
  namespace: string;
  docId: string;
  text: string;
  baseMetadata?: Omit<TMeta, 'docId' | 'text'>;
}

export interface SearchOptions {
  namespace: string;
  query: string;
  topK?: number;
  includeVectors?: boolean;
  includeMetadata?: boolean;
  rerank?: boolean; // default false
}

export class RagService<TMeta extends RagChunkMetadataBase = RagChunkMetadataBase> {
  private readonly vectorDb: AbstractVectorDatabase<TMeta, number[]>;
  private readonly embeddingModel: any;
  private readonly chunker: SimpleChunker;
  private readonly reranker?: Reranker<TMeta>;
  private readonly storeTextInMetadata: boolean;
  private readonly contextualized?: NonNullable<RagServiceOptions<TMeta>['contextualized']>;
  private readonly contextualizedEmbedder?: ContextualizedEmbedder;

  constructor(options: RagServiceOptions<TMeta>) {
    this.vectorDb = options.vectorDb;
    this.embeddingModel = options.embeddingModel as any;
    // Voyage contextualized embeddings recommend no overlap
    if (options.contextualized?.enabled && !options.chunker) {
      this.chunker = new SimpleChunker({ maxTokens: 300, overlapTokens: 0 });
    } else {
      this.chunker = options.chunker ?? new SimpleChunker({ maxTokens: 300, overlapTokens: 30 });
    }
    this.reranker = options.reranker;
    this.storeTextInMetadata = options.storeTextInMetadata ?? true;
    this.contextualized = options.contextualized?.enabled ? options.contextualized : undefined;
    if (this.contextualized) {
      this.contextualizedEmbedder = new VoyageContextualizedEmbedder({
        apiKey: this.contextualized.apiKey,
        model: this.contextualized.model,
        baseUrl: this.contextualized.baseUrl,
        outputDimension: this.contextualized.outputDimension,
        outputDtype: this.contextualized.outputDtype,
      });
    }
  }

  async indexDocument({ namespace, docId, text, baseMetadata }: IndexDocumentOptions<TMeta>): Promise<void> {
    const chunks = this.chunker.chunk(text, (i) => `${docId}#${i}`);
    await this.indexChunks(namespace, docId, chunks, baseMetadata as any);
  }

  async indexChunks(
    namespace: string,
    docId: string,
    chunks: Chunk[],
    baseMetadata?: Omit<TMeta, 'docId' | 'text'>,
  ): Promise<void> {
    if (chunks.length === 0) return;
    const texts = chunks.map((c) => c.text);

    let vectors: number[][];
    if (this.contextualized && this.contextualizedEmbedder) {
      // Use contextualized chunk embeddings: one document per request, inputs = [chunks]
      vectors = await this.contextualizedEmbedder.embed([[...texts]], 'document');
    } else {
      const { embeddings } = await embedMany({ model: this.embeddingModel, values: texts });
      vectors = (embeddings as any) as number[][];
    }

    const entries = chunks.map((c, i) => ({
      id: c.id,
      vector: vectors[i] as number[],
      metadata: {
        ...(baseMetadata ?? {}),
        docId,
        ...(this.storeTextInMetadata ? { text: c.text } : {}),
      } as TMeta,
    }));

    await this.vectorDb.upsert(namespace, entries as any);
  }

  async search(options: SearchOptions): Promise<VectorEntry<number[], TMeta, any>[]> {
    const topK = options.topK ?? 8;
    let queryVector: number[];
    if (this.contextualized && this.contextualizedEmbedder) {
      const [vec] = await this.contextualizedEmbedder.embed([[options.query]], 'query');
      queryVector = vec;
    } else {
      const { embeddings } = await embedMany({ model: this.embeddingModel, values: [options.query] });
      queryVector = (embeddings as any)[0] as number[];
    }
    const results = await this.vectorDb.query(options.namespace, queryVector, topK, {
      includeMetadata: (options.includeMetadata ?? true) as any,
      includeVectors: (options.includeVectors ?? false) as any,
    });

    if (!options.rerank || !this.reranker) return results;

    const items = results.map((r) => ({
      id: r.id,
      text: (r as any).metadata?.text ?? '',
      metadata: r.metadata,
    }));
    const reranked = await this.reranker.rerank(options.query, items, topK);

    // Map reranked order back to results
    const byId = new Map(results.map((r) => [r.id, r] as const));
    return reranked.map((it) => byId.get(it.id)!).filter(Boolean);
  }

  // contextualized embedding handled by contextualizedEmbedder
}


