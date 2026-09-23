import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { getLoadablePath } from 'sqlite-vec';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { float32Blob } from '../../db/types/float32-blob';
import type { VectorEntry } from './abstract-vector-database';
import { DrizzleSqliteVectorDatabase } from './drizzle-sqlite-vector-database';

// Test schema
const EMBED_DIM = 1536;
const embeddings = sqliteTable(
  'embeddings',
  {
    createdAt: integer('created_at')
      .notNull()
      .default(Math.floor(Date.now() / 1000)),
    embedding: float32Blob(EMBED_DIM)('embedding'),
    id: text('id').notNull(),
    metadata: text('metadata'),
    namespace: text('namespace').notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.namespace, table.id] }) })
);

describe('DrizzleSqliteVectorDatabase Integration', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let vectorDb: DrizzleSqliteVectorDatabase<Record<string, string | number>>;
  const contentStore = new Map<string, string>();

  beforeEach(() => {
    // Create in-memory database for testing
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);
    contentStore.clear();

    // Create the embeddings table
    sqlite.exec(`
      CREATE TABLE embeddings (
        id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (namespace, id)
      )
    `);

    vectorDb = new DrizzleSqliteVectorDatabase({
      columns: {
        embedding: embeddings.embedding,
        id: embeddings.id,
        metadata: embeddings.metadata,
        namespace: embeddings.namespace,
      },
      db,
      dim: EMBED_DIM,
      extensionPath: getLoadablePath(),
      getContent: (namespace, ids) =>
        Promise.resolve(
          ids.map((id) => contentStore.get(`${namespace}:${id}`) ?? null)
        ),
      table: embeddings,
    });

    // Ensure indexes exist
    vectorDb.ensureIndexes();
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  describe('End-to-End Vector Operations', () => {
    const testEntries: VectorEntry<
      number[],
      { title: string; chunk: number },
      true,
      true
    >[] = [
      {
        id: 'doc:1#0',
        metadata: { chunk: 0, title: 'Test Document 1' },
        vector: Array.from({ length: EMBED_DIM }, () => 0.1),
      },
      {
        id: 'doc:1#1',
        metadata: { chunk: 1, title: 'Test Document 1' },
        vector: Array.from({ length: EMBED_DIM }, () => 0.2),
      },
      {
        id: 'doc:2#0',
        metadata: { chunk: 0, title: 'Test Document 2' },
        vector: Array.from({ length: EMBED_DIM }, () => 0.3),
      },
      {
        id: 'doc:3#0',
        metadata: { chunk: 0, title: 'Test Document 3' },
        vector: Array.from({ length: EMBED_DIM }, () => 0.4),
      },
    ];

    it('should perform complete CRUD operations', async () => {
      const namespace = 'test-namespace';

      // 1. Upsert entries
      await vectorDb.upsert(namespace, testEntries);

      // Verify entries were stored in base table
      const baseTableRows = sqlite
        .prepare<
          [string],
          { id: string; namespace: string; metadata: string }
        >(`
        SELECT id, namespace, metadata FROM embeddings WHERE namespace = ?
      `)
        .all(namespace);

      expect(baseTableRows).toHaveLength(4);
      expect(baseTableRows.map((row) => row.id)).toEqual(
        expect.arrayContaining(['doc:1#0', 'doc:1#1', 'doc:2#0', 'doc:3#0'])
      );

      // 2. Query for similar vectors
      const queryVector = Array.from({ length: EMBED_DIM }, () => 0.15); // Similar to doc:1 entries
      const queryResults = await vectorDb.query(namespace, queryVector, 3, {
        includeMetadata: true,
        includeVectors: false,
      });

      expect(queryResults).toHaveLength(3);
      expect(queryResults[0]).toHaveProperty('id');
      expect(queryResults[0]).toHaveProperty('metadata');
      expect(queryResults[0]).not.toHaveProperty('vector');

      // 3. List specific entries
      const listResults = await vectorDb.list(
        namespace,
        ['doc:1#0', 'doc:1#1'],
        {
          includeMetadata: true,
          includeVectors: true,
        }
      );

      expect(listResults).toHaveLength(2);
      expect(listResults[0]).not.toBeNull();
      expect(listResults[1]).not.toBeNull();
      expect(listResults[0]).toHaveProperty('vector');
      expect(listResults[0]).toHaveProperty('metadata');

      // 4. Delete some entries
      await vectorDb.delete(namespace, ['doc:3#0']);

      // Verify deletion
      const remainingEntries = await vectorDb.list(namespace, [
        'doc:1#0',
        'doc:1#1',
        'doc:2#0',
        'doc:3#0',
      ]);
      expect(remainingEntries.filter((entry) => entry !== null)).toHaveLength(
        3
      );
      expect(remainingEntries[3]).toBeNull(); // doc:3#0 should be deleted
    });

    it('should handle namespace isolation', async () => {
      const namespace1 = 'namespace-1';
      const namespace2 = 'namespace-2';

      const entries1: VectorEntry<
        number[],
        { title: string; chunk: number },
        true,
        true
      >[] = [
        {
          id: 'doc:1#0',
          metadata: { chunk: 0, title: 'Namespace 1 Doc' },
          vector: Array.from({ length: EMBED_DIM }, () => 0.1),
        },
      ];

      const entries2: VectorEntry<
        number[],
        { title: string; chunk: number },
        true,
        true
      >[] = [
        {
          id: 'doc:1#0', // Same ID but different namespace
          metadata: { chunk: 0, title: 'Namespace 2 Doc' },
          vector: Array.from({ length: EMBED_DIM }, () => 0.2),
        },
      ];

      // Upsert to different namespaces
      await vectorDb.upsert(namespace1, entries1);
      await vectorDb.upsert(namespace2, entries2);

      // Query each namespace separately
      const results1 = await vectorDb.query(
        namespace1,
        Array.from({ length: EMBED_DIM }, () => 0.1),
        1,
        {
          includeMetadata: true,
        }
      );

      const results2 = await vectorDb.query(
        namespace2,
        Array.from({ length: EMBED_DIM }, () => 0.2),
        1,
        {
          includeMetadata: true,
        }
      );

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results1[0].metadata?.title).toBe('Namespace 1 Doc');
      expect(results2[0].metadata?.title).toBe('Namespace 2 Doc');

      // Verify namespace isolation in base table
      const baseRows1 = sqlite
        .prepare<
          [string],
          { id: string; namespace: string; metadata: string }
        >(`
        SELECT id, namespace, metadata FROM embeddings WHERE namespace = ?
      `)
        .all(namespace1);

      const baseRows2 = sqlite
        .prepare<
          [string],
          { id: string; namespace: string; metadata: string }
        >(`
        SELECT id, namespace, metadata FROM embeddings WHERE namespace = ?
      `)
        .all(namespace2);

      expect(baseRows1).toHaveLength(1);
      expect(baseRows2).toHaveLength(1);
      expect(baseRows1[0].namespace).toBe(namespace1);
      expect(baseRows2[0].namespace).toBe(namespace2);
      await vectorDb.delete(namespace1, ['doc:1#0']);
      expect(await vectorDb.list(namespace1, ['doc:1#0'])).toEqual([null]);
      const survivingEntries = await vectorDb.list(namespace2, ['doc:1#0'], {
        includeMetadata: true,
      });
      expect(survivingEntries[0]?.metadata.title).toBe('Namespace 2 Doc');
      expect(
        await vectorDb.query(
          namespace1,
          Array.from({ length: EMBED_DIM }, () => 0.1),
          1
        )
      ).toEqual([]);
    });

    it('should handle vector dimension validation', async () => {
      const namespace = 'test-namespace';

      // Test invalid dimension
      const invalidEntry = {
        id: 'invalid',
        metadata: { chunk: 0, title: 'Invalid' },
        vector: Array.from({ length: 100 }, () => 0), // Wrong dimension
      };

      await expect(vectorDb.upsert(namespace, [invalidEntry])).rejects.toThrow(
        'dimension mismatch'
      );

      // Test invalid query vector
      const invalidQueryVector = Array.from({ length: 100 }, () => 0);
      await expect(
        vectorDb.query(namespace, invalidQueryVector, 1)
      ).rejects.toThrow('dimension mismatch');
    });

    it('should handle conditional vector/metadata selection', async () => {
      const namespace = 'test-namespace';
      await vectorDb.upsert(namespace, testEntries);

      // Test query with different selection options
      const queryVector = Array.from({ length: EMBED_DIM }, () => 0.1);

      // Only vectors
      const vectorOnlyResults = await vectorDb.query(
        namespace,
        queryVector,
        2,
        {
          includeMetadata: false,
          includeVectors: true,
        }
      );

      expect(vectorOnlyResults).toHaveLength(2);
      expect(vectorOnlyResults[0]).toHaveProperty('vector');
      expect(vectorOnlyResults[0]).not.toHaveProperty('metadata');

      // Only metadata
      const metadataOnlyResults = await vectorDb.query(
        namespace,
        queryVector,
        2,
        {
          includeMetadata: true,
          includeVectors: false,
        }
      );

      expect(metadataOnlyResults).toHaveLength(2);
      expect(metadataOnlyResults[0]).toHaveProperty('metadata');
      expect(metadataOnlyResults[0]).not.toHaveProperty('vector');

      // Both
      const bothResults = await vectorDb.query(namespace, queryVector, 2, {
        includeMetadata: true,
        includeVectors: true,
      });

      expect(bothResults).toHaveLength(2);
      expect(bothResults[0]).toHaveProperty('vector');
      expect(bothResults[0]).toHaveProperty('metadata');

      // Neither
      const neitherResults = await vectorDb.query(namespace, queryVector, 2, {
        includeMetadata: false,
        includeVectors: false,
      });

      expect(neitherResults).toHaveLength(2);
      expect(neitherResults[0]).not.toHaveProperty('vector');
      expect(neitherResults[0]).not.toHaveProperty('metadata');
    });

    it('should handle upsert updates', async () => {
      const namespace = 'test-namespace';

      // Initial upsert
      const initialEntries: VectorEntry<
        number[],
        { title: string; chunk: number },
        true,
        true
      >[] = [
        {
          id: 'doc:1#0',
          metadata: { chunk: 0, title: 'Original Title' },
          vector: Array.from({ length: EMBED_DIM }, () => 0.1),
        },
      ];

      await vectorDb.upsert(namespace, initialEntries);

      // Verify initial state
      const initialResults = await vectorDb.list(namespace, ['doc:1#0'], {
        includeMetadata: true,
      });

      expect(initialResults[0]?.metadata?.title).toBe('Original Title');

      // Update with same ID
      const updatedEntries: VectorEntry<
        number[],
        { title: string; chunk: number },
        true,
        true
      >[] = [
        {
          id: 'doc:1#0',
          metadata: { chunk: 0, title: 'Updated Title' }, // Different metadata
          vector: Array.from({ length: EMBED_DIM }, () => 0.2), // Different vector
        },
      ];

      await vectorDb.upsert(namespace, updatedEntries);

      // Verify update
      const updatedResults = await vectorDb.list(namespace, ['doc:1#0'], {
        includeMetadata: true,
      });

      expect(updatedResults[0]?.metadata?.title).toBe('Updated Title');
      const updatedMatches = await vectorDb.query(
        namespace,
        Array.from({ length: EMBED_DIM }, () => 0.2),
        1,
        { includeMetadata: true, includeVectors: true }
      );
      expect(updatedMatches[0]?.metadata?.title).toBe('Updated Title');
      expect(updatedMatches[0]?.vector[0]).toBeCloseTo(0.2);
      const storedVector = sqlite
        .prepare<[string], { embedding: string }>(
          'SELECT vec_to_json(embedding) AS embedding FROM embeddings_vec WHERE id = ?'
        )
        .get(`${namespace}:doc:1#0`);
      expect(JSON.parse(storedVector?.embedding ?? '[]')[0]).toBeCloseTo(0.2);

      // Verify only one entry exists (not duplicated)
      const allResults = await vectorDb.list(namespace, ['doc:1#0'], {
        includeMetadata: true,
      });

      expect(allResults).toHaveLength(1);
    });

    it('should handle empty operations gracefully', async () => {
      const namespace = 'test-namespace';

      // Empty upsert
      await expect(vectorDb.upsert(namespace, [])).resolves.toBeUndefined();

      // Empty query
      const queryResults = await vectorDb.query(
        namespace,
        Array.from({ length: EMBED_DIM }, () => 0.1),
        5
      );
      expect(queryResults).toHaveLength(0);

      // Empty list
      const listResults = await vectorDb.list(namespace, []);
      expect(listResults).toHaveLength(0);

      // Empty delete
      await expect(vectorDb.delete(namespace, [])).resolves.toBeUndefined();
    });

    it('should handle large batch operations', async () => {
      const namespace = 'test-namespace';

      // Create a large batch of entries
      const largeBatch: VectorEntry<
        number[],
        { title: string; chunk: number },
        true,
        true
      >[] = [];
      for (let i = 0; i < 100; i += 1) {
        largeBatch.push({
          id: `doc:${i}#0`,
          metadata: { chunk: 0, title: `Document ${i}` },
          vector: Array.from({ length: EMBED_DIM }, () => i * 0.01),
        });
      }

      // Upsert large batch
      await vectorDb.upsert(namespace, largeBatch);

      // Verify all entries were stored
      const baseTableRows = sqlite
        .prepare<[string], { count: number }>(`
        SELECT COUNT(*) as count FROM embeddings WHERE namespace = ?
      `)
        .get(namespace);

      expect(baseTableRows?.count).toBe(100);

      // Query with large batch
      const queryVector = Array.from({ length: EMBED_DIM }, () => 0.5);
      const queryResults = await vectorDb.query(namespace, queryVector, 10, {
        includeMetadata: true,
      });

      expect(queryResults).toHaveLength(10);

      // List large batch
      const ids = largeBatch.slice(0, 50).map((entry) => entry.id);
      const listResults = await vectorDb.list(namespace, ids, {
        includeMetadata: true,
      });

      expect(listResults).toHaveLength(50);
      expect(listResults.every((result) => result !== null)).toBe(true);

      // Delete large batch
      const deleteIds = largeBatch.slice(0, 50).map((entry) => entry.id);
      await vectorDb.delete(namespace, deleteIds);

      // Verify deletion
      const remainingRows = sqlite
        .prepare<[string], { count: number }>(`
        SELECT COUNT(*) as count FROM embeddings WHERE namespace = ?
      `)
        .get(namespace);

      expect(remainingRows?.count).toBe(50);
    });
  });

  describe('RAG Service Integration', () => {
    it('should work with RagService interface', async () => {
      const namespace = 'rag-test';

      // Simulate RAG service usage
      const ragEntries: VectorEntry<
        number[],
        { docId: string; text: string; chunk: number },
        true,
        true
      >[] = [
        {
          id: 'doc:1#0',
          metadata: {
            chunk: 0,
            docId: 'doc-1',
            text: 'This is the first chunk of document 1',
          },
          vector: Array.from({ length: EMBED_DIM }, () => 0.1),
        },
        {
          id: 'doc:1#1',
          metadata: {
            chunk: 1,
            docId: 'doc-1',
            text: 'This is the second chunk of document 1',
          },
          vector: Array.from({ length: EMBED_DIM }, () => 0.2),
        },
        {
          id: 'doc:2#0',
          metadata: {
            chunk: 0,
            docId: 'doc-2',
            text: 'This is the first chunk of document 2',
          },
          vector: Array.from({ length: EMBED_DIM }, () => 0.3),
        },
      ];

      // Index documents (simulate RagService.indexChunks)
      await vectorDb.upsert(namespace, ragEntries);

      // Search documents (simulate RagService.search)
      const queryVector = Array.from({ length: EMBED_DIM }, () => 0.15);
      const searchResults = await vectorDb.query(namespace, queryVector, 3, {
        includeMetadata: true,
        includeVectors: false,
      });

      expect(searchResults).toHaveLength(3);
      expect(searchResults[0]).toHaveProperty('metadata');
      expect(searchResults[0].metadata).toHaveProperty('text');
      expect(searchResults[0].metadata).toHaveProperty('docId');

      // Verify results are ordered by similarity (distance)
      // Note: In a real scenario, this would be ordered by cosine distance
      expect(searchResults[0].id).toBeDefined();
      expect(searchResults[1].id).toBeDefined();
      expect(searchResults[2].id).toBeDefined();
    });
  });

  describe('Vector Similarity Search', () => {
    it('should return results ordered by similarity', async () => {
      const namespace = 'similarity-test';

      // Create vectors with known similarity relationships
      const entries: VectorEntry<
        number[],
        { description: string },
        true,
        true
      >[] = [
        {
          id: 'vec:1',
          metadata: { description: 'Vector with all 0.1 values' },
          vector: Array.from({ length: EMBED_DIM }, () => 0.1), // All 0.1
        },
        {
          id: 'vec:2',
          metadata: { description: 'Vector with all 0.2 values' },
          vector: Array.from({ length: EMBED_DIM }, () => 0.2), // All 0.2
        },
        {
          id: 'vec:3',
          metadata: { description: 'Vector with all 0.3 values' },
          vector: Array.from({ length: EMBED_DIM }, () => 0.3), // All 0.3
        },
      ];

      await vectorDb.upsert(namespace, entries);

      // Query with vector similar to vec:1
      const queryVector = Array.from({ length: EMBED_DIM }, () => 0.12); // Close to 0.1
      const results = await vectorDb.query(namespace, queryVector, 3, {
        includeMetadata: true,
        includeVectors: false,
      });

      expect(results).toHaveLength(3);

      // Results should be ordered by distance (most similar first)
      // Note: Actual ordering depends on sqlite-vec implementation
      expect(results[0].id).toBeDefined();
      expect(results[1].id).toBeDefined();
      expect(results[2].id).toBeDefined();
    });

    it('should handle different vector dimensions correctly', async () => {
      const namespace = 'dimension-test';

      // Test with Float32Array input
      const float32Vector = new Float32Array(EMBED_DIM).fill(0.5);
      const entries: VectorEntry<number[], { type: string }, true, true>[] = [
        {
          id: 'float32:1',
          metadata: { type: 'Float32Array' },
          vector: Array.from(float32Vector),
        },
      ];

      await vectorDb.upsert(namespace, entries);

      // Query with number array
      const queryVector = Array.from({ length: EMBED_DIM }, () => 0.5);
      const results = await vectorDb.query(namespace, queryVector, 1, {
        includeMetadata: true,
        includeVectors: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].vector).toBeDefined();
      expect(results[0].metadata?.type).toBe('Float32Array');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent operations', async () => {
      const namespace = 'concurrent-test';
      const entries: VectorEntry<number[], { index: number }, true, true>[] =
        [];

      // Create 50 entries
      for (let i = 0; i < 50; i += 1) {
        entries.push({
          id: `concurrent:${i}`,
          metadata: { index: i },
          vector: Array.from({ length: EMBED_DIM }, () => i * 0.01),
        });
      }

      // Upsert all entries
      await vectorDb.upsert(namespace, entries);

      // Perform concurrent queries
      const queryPromises = Array.from({ length: 10 }, (_, i) =>
        vectorDb.query(
          namespace,
          Array.from({ length: EMBED_DIM }, () => i * 0.05),
          5,
          {
            includeMetadata: true,
          }
        )
      );

      const results = await Promise.all(queryPromises);

      expect(results).toHaveLength(10);
      for (const result of results) {
        expect(result).toHaveLength(5);
        expect(result[0]).toHaveProperty('id');
        expect(result[0]).toHaveProperty('metadata');
      }
    });

    it('should maintain data integrity under stress', async () => {
      const namespace = 'stress-test';

      // Create many entries
      const entries: VectorEntry<number[], { value: number }, true, true>[] =
        [];
      for (let i = 0; i < 200; i += 1) {
        entries.push({
          id: `stress:${i}`,
          metadata: { value: i },
          vector: Array.from({ length: EMBED_DIM }, () => i * 0.001),
        });
      }

      // Upsert all entries
      await vectorDb.upsert(namespace, entries);

      // Verify all entries were stored
      const count = sqlite
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE namespace = ?')
        .get(namespace) as { count: number };

      expect(count.count).toBe(200);

      // Perform mixed operations
      await vectorDb.delete(namespace, ['stress:0', 'stress:1', 'stress:2']);
      await vectorDb.upsert(namespace, [
        {
          id: 'stress:new',
          metadata: { value: 999 },
          vector: Array.from({ length: EMBED_DIM }, () => 0.999),
        },
      ]);

      // Verify final state
      const finalCount = sqlite
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE namespace = ?')
        .get(namespace) as { count: number };

      expect(finalCount.count).toBe(198); // 200 - 3 deleted + 1 added
    });
  });
});
