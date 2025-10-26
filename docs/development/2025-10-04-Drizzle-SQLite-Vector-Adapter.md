# Feature: Drizzle SQLite Vector

## 1. Codebase-First Analysis

### Existing Code Search

- `src/services/vector/abstract-vector-database.ts`: core interface
- `src/services/vector/upstash-vector-database.ts`: reference impl
- `src/services/rag/rag-service.ts`: upsert/query usage
- `src/services/rag/simple-chunker.ts`: chunking
- `src/utils/*`: id/date/error utils (potential)

### Reusable Scaffolding

- Extend `AbstractVectorDatabase<number[]>`
- Mirror `UpstashVectorDatabase` method shapes
- Reuse `RagService` integration contract
- Use `SimpleChunker` + existing embedding flow

### External Research (If Necessary)

- `sqlite-vec` extension loading
- Drizzle customType for sqlite BLOB
- Raw SQL for indexes, vector ops

## 2. Specifications

### User Stories

- Index embeddings to SQLite w/ namespaces
- Query topK by cosine distance
- Fetch entries by ids; optional vectors/metadata
- Delete by ids

### Technical Approach

- Drizzle + better-sqlite3; load `sqlite-vec` extension
- Schema: developer-provided table/columns; required: `id`, `namespace`, `embedding (F32_BLOB)`, `metadata JSON`
- customType: `float32Blob(dim)` for Float32Array <-> BLOB conversion
- Virtual Table: `CREATE VIRTUAL TABLE ... USING vec0(id, namespace, embedding float[dim])` + composite index on `namespace`
- Upsert: dual writes to base table and vec0 virtual table; JSON metadata
- Query: `vec0` virtual table `MATCH` operator; order by distance asc; topK; conditional vector/metadata selection
- List: base table lookup by ids; conditional selection
- Delete: dual deletes from both tables

## 3. Development Steps

1. ✅ Add deps: `sqlite-vec drizzle-orm better-sqlite3 drizzle-kit @types/better-sqlite3`
2. ✅ Create `src/services/vector/drizzle-sqlite-vector-database.ts`
3. ✅ Create `src/db/sqlite-vec-loader.ts` utility for loading sqlite-vec extension
4. ✅ Create `src/db/types/float32-blob.ts` customType for Float32Array BLOB handling
5. ✅ Implement `ensureIndexes()` helper for vec0 virtual table + composite index creation
6. ✅ Implement constructor with table + column mapping and dimension validation
7. ✅ Implement `upsert(namespace, entries)` with dual writes to base table and vec0 virtual table
8. ✅ Implement `query(namespace, vector, topK, opts)` using vec0 virtual table MATCH operator
9. ✅ Implement `list(namespace, ids, opts)` with conditional selection from base table
10. ✅ Implement `delete(namespace, ids)` with dual deletes from both tables
11. ✅ Update docs with correct sqlite-vec syntax and usage examples

## 4. Usage Examples

### Basic Setup

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { float32Blob } from "@/db/types/float32-blob";
import { DrizzleSqliteVectorDatabase } from "@/services/vector/drizzle-sqlite-vector-database";

// Define your schema
const EMBED_DIM = 1536;
const embeddings = sqliteTable("embeddings", {
  id: text("id").primaryKey(),
  namespace: text("namespace").notNull(),
  embedding: float32Blob(EMBED_DIM)("embedding"),
  metadata: text("metadata"),
  createdAt: integer("created_at")
    .notNull()
    .default(Math.floor(Date.now() / 1000)),
});

// Initialize database
const sqlite = new Database("app.db");
const db = drizzle(sqlite);

// Create vector database
const vectorDb = new DrizzleSqliteVectorDatabase({
  db,
  table: embeddings,
  columns: {
    id: embeddings.id,
    namespace: embeddings.namespace,
    embedding: embeddings.embedding,
    metadata: embeddings.metadata,
  },
  dim: EMBED_DIM,
});

// Ensure indexes exist
await vectorDb.ensureIndexes();
```

### RAG Integration

```ts
import { RagService } from "@/services/rag/rag-service";
import { SimpleChunker } from "@/services/rag/simple-chunker";

const rag = new RagService({
  vectorDb, // DrizzleSqliteVectorDatabase instance
  embeddingModel: voyage.textEmbeddingModel("voyage-3"),
  chunker: new SimpleChunker({ maxTokens: 400 }),
});

// Index documents
await rag.indexDocument({
  namespace: "docs",
  docId: "doc-1",
  text: "Your document content here...",
});

// Search
const results = await rag.search({
  namespace: "docs",
  query: "search query",
  topK: 8,
  includeMetadata: true,
});
```

### Performance Notes

- **Local-first**: No environment variables or network calls required
- **Batch operations**: Use transactions for better performance with large batches
- **Memory usage**: Vectors stored as Float32Array BLOBs for efficiency
- **Scaling**: Suitable for small-to-medium datasets; consider managed vector DBs for large-scale production
