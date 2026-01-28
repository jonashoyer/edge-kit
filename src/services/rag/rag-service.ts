import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { embedMany } from 'ai';
import type {
  AbstractVectorDatabase,
  VectorDatabaseWithContent,
  VectorEntry,
} from '../vector/abstract-vector-database';
import type { AbstractChunker, Chunk } from './abstract-chunker';
import {
  type ContextualizedEmbedder,
  ContextualizedInputType,
  VoyageContextualizedEmbedder,
} from './contextualized-embedder';

export interface RagChunkMetadataBase {
  docId: string;
  source?: string;
  tags?: string[];
  text?: string;
  [key: string]: any;
}

export interface Reranker<TMeta = RagChunkMetadataBase> {
  rerank(
    query: string,
    items: Array<{ id: string; text: string; metadata?: TMeta }>,
    topK?: number
  ): Promise<
    Array<{ id: string; text: string; metadata?: TMeta; score?: number }>
  >;
}

export interface RagServiceOptions<
  TMeta extends RagChunkMetadataBase = RagChunkMetadataBase,
  TVectorDb extends AbstractVectorDatabase<TMeta, number[], true> = AbstractVectorDatabase<
    TMeta,
    number[],
    true
  >,
> {
  vectorDb: TVectorDb;
  embeddingModel: EmbeddingModelV3; // model from AI SDK provider (e.g. voyage.embeddingModel('voyage-3'))
  chunker?: AbstractChunker;
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

export interface IndexDocumentOptions<
  TMeta extends RagChunkMetadataBase = RagChunkMetadataBase,
> {
  namespace: string;
  docId: string;
  text: string;
  baseMetadata?: Omit<TMeta, 'docId' | 'text'>;
}

export interface SearchOptions {
  namespace: string;
  query: string;
  topK?: number;
  candidateTopK?: number;
  includeVectors?: boolean;
  includeMetadata?: boolean;
  rerank?: boolean; // default false
}

// Voyage contextualized embeddings recommend no overlap
// this.chunker = new SimpleChunker({ maxTokens: 300, overlapTokens: 0 });
/**
 * Comprehensive RAG (Retrieval-Augmented Generation) service.
 * Orchestrates chunking, embedding, indexing, retrieval, and optional reranking.
 * Supports standard and contextualized embeddings via provider abstractions.
 */
export class RagService<
  TMeta extends RagChunkMetadataBase = RagChunkMetadataBase,
  TVectorDb extends AbstractVectorDatabase<TMeta, number[], true> = AbstractVectorDatabase<
    TMeta,
    number[],
    true
  >,
> {
  private readonly vectorDb: TVectorDb;
  private readonly embeddingModel: EmbeddingModelV3;
  private readonly chunker: AbstractChunker | undefined;
  private readonly reranker?: Reranker<TMeta>;
  private readonly storeTextInMetadata: boolean;
  private readonly contextualized?: NonNullable<
    RagServiceOptions<TMeta, TVectorDb>['contextualized']
  >;
  private readonly contextualizedEmbedder?: ContextualizedEmbedder;

  constructor(options: RagServiceOptions<TMeta, TVectorDb>) {
    this.vectorDb = options.vectorDb;
    this.embeddingModel = options.embeddingModel;
    this.chunker = options.chunker;
    this.reranker = options.reranker;
    this.storeTextInMetadata = options.storeTextInMetadata ?? true;
    this.contextualized = options.contextualized?.enabled
      ? options.contextualized
      : undefined;
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

  async indexDocument({
    namespace,
    docId,
    text,
    baseMetadata,
  }: IndexDocumentOptions<TMeta>): Promise<void> {
    const chunks = this.chunker
      ? this.chunker.chunk(text, (i) => `${docId}#${i}`)
      : [{ id: docId, text }];
    await this.indexChunks(namespace, docId, chunks, baseMetadata);
  }

  async getVectors(
    texts: string[],
    inputType: ContextualizedInputType
  ) {
    if (this.contextualized && this.contextualizedEmbedder) {
      // Use contextualized chunk embeddings: one document per request, inputs = [chunks]
      return await this.contextualizedEmbedder.embed(
        [[...texts]],
        inputType
      );
    } else {
      const { embeddings } = await embedMany({
        model: this.embeddingModel,
        values: texts,
      });
      return embeddings;
    }
  }

  async indexChunks(
    namespace: string,
    docId: string,
    chunks: Chunk[],
    baseMetadata?: Omit<TMeta, 'docId' | 'text'>
  ): Promise<void> {
    if (chunks.length === 0) return;
    const texts = chunks.map((c) => c.text);

    const vectors = await this.getVectors(texts, 'document');

    const entries = chunks.map((c, i) => ({
      id: c.id,
      vector: vectors[i],
      metadata: {
        ...(baseMetadata ?? {}),
        docId,
        ...(this.storeTextInMetadata ? { text: c.text } : {}),
      } as TMeta,
    }));

    await this.vectorDb.upsert(namespace, entries as any);
  }

  withContent(): RagService<
    TMeta,
    VectorDatabaseWithContent<TMeta, number[]>
  > {
    if (!this.vectorDb.getContent) {
      throw new Error(
        'vectorDb.getContent is required to enable reranking.'
      );
    }
    return this as RagService<
      TMeta,
      VectorDatabaseWithContent<TMeta, number[]>
    >;
  }

  async search(
    this: RagService<TMeta, VectorDatabaseWithContent<TMeta, number[]>>,
    options: SearchOptions & { rerank: true }
  ): Promise<VectorEntry<number[], TMeta, any>[]>;
  async search(
    options: SearchOptions
  ): Promise<VectorEntry<number[], TMeta, any>[]> {
    const topK = options.topK ?? 8;
    const shouldRerank =
      options.rerank === true && this.reranker !== undefined;
    const candidateTopKDefault = shouldRerank ? topK * 4 : topK;
    const candidateTopK = Math.max(
      options.candidateTopK ?? candidateTopKDefault,
      topK
    );

    const [queryVector] = await this.getVectors([options.query], 'query');

    const results = await this.vectorDb.query(
      options.namespace,
      queryVector,
      candidateTopK,
      {
        includeMetadata: options.includeMetadata ?? true,
        includeVectors: options.includeVectors ?? false,
      }
    );

    if (!shouldRerank) return results;
    const reranker = this.reranker;
    if (!reranker) return results;
    const getContent = this.vectorDb.getContent;
    if (!getContent) {
      throw new Error(
        'Reranking requires vectorDb.getContent to be provided.'
      );
    }

    const ids = results.map((result) => result.id);
    const contents = await getContent(options.namespace, ids);
    const items = results.map((result, index) => ({
      id: result.id,
      text: contents[index] ?? '',
      metadata: result.metadata,
    }));
    const reranked = await reranker.rerank(options.query, items, topK);

    // Map reranked order back to results
    return reranked
      .map((it) => results.find((entry) => entry.id === it.id))
      .filter(
        (entry): entry is VectorEntry<number[], TMeta, boolean, false> =>
          Boolean(entry)
      );
  }

  // contextualized embedding handled by contextualizedEmbedder
}
