# Vector + RAG Basics

Edge Kit includes a minimal RAG foundation built on the `AbstractVectorDatabase` and AI SDK.

## Components

- Vector DB: `UpstashVectorDatabase` (or bring your own)
- Embeddings: AI SDK `embedMany` with a provider model (e.g., `voyage.textEmbeddingModel('voyage-3')`)
- Chunker: `SimpleChunker`
- Optional Reranker: `SimpleReranker` (LLM-scoring fallback)
- Unified Service: `RagService` (handles chunking, embeddings, vector upsert/query, and optional rerank)

## Quick Start

```ts
// Embedding model (Voyage via AI SDK provider)
import { voyage } from 'voyage-ai-provider';

import { RagService } from '@/services/rag/rag-service';
import { SimpleChunker } from '@/services/rag/simple-chunker';
import { SimpleReranker } from '@/services/rag/simple-reranker';
// Optional reranking (Voyage reranker)
import { VoyageReranker } from '@/services/rag/voyage-reranker';
import { UpstashVectorDatabase } from '@/services/vector/upstash-vector-database';

// Vector DB
// Provide content from your primary store for reranking.
const contentStore = new Map<string, string>();
const vectorDb = new UpstashVectorDatabase({
  url: process.env.VECTOR_URL!,
  token: process.env.VECTOR_TOKEN!,
  getContent: (namespace, ids) =>
    Promise.resolve(
      ids.map((id) => contentStore.get(`${namespace}:${id}`) ?? null)
    ),
});

const embeddingModel = voyage.textEmbeddingModel('voyage-3');

// Unified RAG service
const rag = new RagService({ vectorDb, embeddingModel });

// Chunking
const chunker = new SimpleChunker({ maxTokens: 300, overlapTokens: 30 });

const doc = '... your long text ...';
await rag.indexDocument({ namespace: 'my-namespace', docId: 'doc-1', text: doc, baseMetadata: { source: 'example' } });

// Retrieval
const results = await rag.search({ namespace: 'my-namespace', query: 'what does it say about pricing?', topK: 8 });

const reranker = new VoyageReranker({ apiKey: process.env.VOYAGE_API_KEY!, model: 'rerank-1' });
const rerankedResults = await rag.search({
  namespace: 'my-namespace',
  query: 'what does it say about pricing?',
  topK: 8,
  rerank: true,
});
```

# Vector Database Services

Edge Kit provides abstract and concrete implementations for vector databases, allowing you to store, retrieve, and query vector embeddings for AI and machine learning applications.

## Overview

The vector database services allow you to:

- Store vector embeddings with associated metadata
- Perform similarity searches to find nearest neighbors
- Manage vectors within namespaces
- Retrieve vectors and their metadata

## Abstract Vector Database Service

The `AbstractVectorDatabase` class defines the interface that all vector database implementations must follow:

```typescript
export type VectorContentProvider = (
  namespace: string,
  ids: string[],
) => Promise<(string | null)[]>;

export type VectorDatabaseOptions = {
  getContent?: VectorContentProvider;
};

export abstract class AbstractVectorDatabase<TMetadata = Record<string, any>, TVector = number[]> {
  constructor(protected options: VectorDatabaseOptions) {}

  readonly getContent?: VectorContentProvider;

  abstract upsert(namespace: string, entries: VectorEntry<TVector, TMetadata, true>[]): Promise<void>;
  abstract delete(namespace: string, ids: string[]): Promise<void>;

  abstract query<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    vector: TVector,
    topK: number,
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>,
  ): Promise<VectorEntry<TVector, TMetadata, TIncludeVectors>[]>;

  abstract list<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    ids: string[],
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>,
  ): Promise<(VectorEntry<TVector, TMetadata, TIncludeVectors, TIncludeMetadata> | null)[]>;
}
```
Provide `getContent` when you plan to use reranking. The provider should return items in the same order as `ids`, using `null` for missing content.

## Available Implementations

### UpstashVectorDatabase

A vector database implementation using Upstash Vector, optimized for serverless environments.

**Location**: `src/services/vector/upstash-vector-database.ts`

**Dependencies**:

- `@upstash/vector`

**Usage**:

```typescript
import { UpstashVectorDatabase } from '../services/vector/upstash-vector-database';

type DocumentMetadata = {
  title: string;
  url: string;
  timestamp: string;
};

const contentStore = new Map<string, string>();
const vectorDb = new UpstashVectorDatabase<DocumentMetadata>({
  url: process.env.UPSTASH_VECTOR_URL!,
  token: process.env.UPSTASH_VECTOR_TOKEN!,
  getContent: (namespace, ids) =>
    Promise.resolve(
      ids.map((id) => contentStore.get(`${namespace}:${id}`) ?? null)
    ),
});

// Store vectors
await vectorDb.upsert('documents', [
  {
    id: 'doc1',
    vector: [0.1, 0.2, 0.3, 0.4], // Embedding vector
    metadata: {
      title: 'Example Document',
      url: 'https://example.com/doc1',
      timestamp: new Date().toISOString(),
    },
  },
]);

// Query similar vectors
const results = await vectorDb.query(
  'documents',
  [0.1, 0.2, 0.3, 0.5], // Query vector
  5, // Return top 5 results
  { includeVectors: false, includeMetadata: true },
);

// Access results
for (const result of results) {
  console.log(result.id, result.metadata?.title);
}
```

## Common Operations

### Storing Vectors

```typescript
// Create vector entries
const entries = [
  {
    id: 'vec1',
    vector: [0.1, 0.2, 0.3], // Your embedding vector
    metadata: { text: 'Example text 1', category: 'A' },
  },
  {
    id: 'vec2',
    vector: [0.2, 0.3, 0.4],
    metadata: { text: 'Example text 2', category: 'B' },
  },
];

// Store in namespace
await vectorDb.upsert('my-namespace', entries);
```

### Querying Similar Vectors

```typescript
// Search for similar vectors
const results = await vectorDb.query(
  'my-namespace',
  [0.15, 0.25, 0.35], // Query vector
  10, // Top 10 results
  {
    includeVectors: false, // Don't include vectors in results
    includeMetadata: true, // Include metadata in results
  },
);

// Process results
for (const match of results) {
  console.log(`Match: ${match.id}`);
  console.log(`Metadata: ${JSON.stringify(match.metadata)}`);
}
```

### Retrieving Specific Vectors

```typescript
// Get specific vectors by ID
const vectors = await vectorDb.list('my-namespace', ['vec1', 'vec2'], {
  includeVectors: true,
  includeMetadata: true,
});

// Access vector data
for (const vector of vectors) {
  if (vector) {
    console.log(`ID: ${vector.id}`);
    console.log(`Vector: ${vector.vector}`);
    console.log(`Metadata: ${JSON.stringify(vector.metadata)}`);
  }
}
```

### Deleting Vectors

```typescript
// Delete vectors by ID
await vectorDb.delete('my-namespace', ['vec1', 'vec2']);
```

## Working with Embeddings

Vector databases are commonly used with embedding models. Here's a pattern for integrating with an embedding model:

```typescript
// Example function to get embeddings (implementation depends on your model)
async function getEmbedding(text: string): Promise<number[]> {
  // Implementation depends on your embedding model
  // Could use OpenAI, Hugging Face, or other services
  // ...
}

// Store document with its embedding
async function storeDocument(id: string, text: string, metadata: any) {
  const embedding = await getEmbedding(text);

  await vectorDb.upsert('documents', [
    {
      id,
      vector: embedding,
      metadata: {
        ...metadata,
        text,
      },
    },
  ]);
}

// Search for similar documents
async function findSimilarDocuments(query: string, limit: number = 5) {
  const queryEmbedding = await getEmbedding(query);

  return await vectorDb.query('documents', queryEmbedding, limit, { includeMetadata: true });
}
```

## Use Cases

### Semantic Search

Store document embeddings and find semantically similar documents:

```typescript
// Search documents semantically
const query = 'climate change effects on agriculture';
const searchResults = await findSimilarDocuments(query);

// Display results
for (const result of searchResults) {
  console.log(`Document: ${result.metadata?.title}`);
  console.log(`Relevance: ${result.score}`); // If score is returned
}
```

### Recommendation Systems

Store item embeddings and find similar items:

```typescript
// Recommend similar products
const productId = 'product-123';
const productVector = await getProductEmbedding(productId);

const similarProducts = await vectorDb.query('products', productVector, 5, { includeMetadata: true });

// Display recommendations
for (const product of similarProducts) {
  if (product.id !== productId) {
    // Exclude the original product
    console.log(`Recommended: ${product.metadata?.name}`);
  }
}
```

### Clustering and Classification

Use vectors for clustering or classification tasks:

```typescript
// Get all vectors for clustering analysis
const allVectors = await vectorDb.list('data-points', allIds, { includeVectors: true, includeMetadata: true });

// Process for clustering (using external library)
const clusters = performClustering(allVectors.map((v) => v?.vector));
```

## Best Practices

1. **Namespace Organization**: Use namespaces to organize different types of vectors:

```typescript
// Example namespaces
await vectorDb.upsert('documents', [...]);
await vectorDb.upsert('products', [...]);
await vectorDb.upsert('users', [...]);
```

2. **Vector Dimensions**: Keep vector dimensions consistent within namespaces:

```typescript
// All vectors in a namespace should have the same dimensions
const documentVectors = someDocuments.map((doc) => ({
  id: doc.id,
  vector: getEmbedding(doc.text), // Always same dimension
  metadata: { title: doc.title },
}));
```

3. **Metadata Efficiency**: Store only necessary metadata:

```typescript
// Good: Store minimal metadata needed for retrieval
await vectorDb.upsert('documents', [
  {
    id: doc.id,
    vector: embedding,
    metadata: {
      title: doc.title,
      url: doc.url,
      // Don't store the full document text here
    },
  },
]);
```
Use `getContent` to retrieve full text from your primary store when reranking.

4. **Error Handling**: Always handle potential errors:

```typescript
try {
  const results = await vectorDb.query('namespace', queryVector, 10);
  // Process results...
} catch (error) {
  console.error('Vector query failed:', error);
  // Handle error...
}
```

## Custom Implementations

You can create your own vector database implementation by extending the `AbstractVectorDatabase` class. Pass `getContent` in `VectorDatabaseOptions` to connect your content store for reranking:

```typescript
import {
  AbstractVectorDatabase,
  VectorDatabaseOptions,
  VectorEntry,
  VectorQueryOptions,
} from '../services/vector/abstract-vector-database';

interface MyVectorOptions extends VectorDatabaseOptions {
  customOption: string;
}

export class MyVectorDatabase<TMetadata = Record<string, any>> extends AbstractVectorDatabase<TMetadata, number[]> {
  constructor(options: MyVectorOptions) {
    super(options);
    // Initialize your vector database client
  }

  async upsert(namespace: string, entries: VectorEntry<number[], TMetadata, true>[]): Promise<void> {
    // Implementation
  }

  async delete(namespace: string, ids: string[]): Promise<void> {
    // Implementation
  }

  async query<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    vector: number[],
    topK: number,
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>,
  ): Promise<VectorEntry<number[], TMetadata, TIncludeVectors>[]> {
    // Implementation
  }

  async list<TIncludeVectors extends boolean, TIncludeMetadata extends boolean>(
    namespace: string,
    ids: string[],
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>,
  ): Promise<(VectorEntry<number[], TMetadata, TIncludeVectors, TIncludeMetadata> | null)[]> {
    // Implementation
  }
}
```
