import type Database from 'better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSqliteVec } from '../../db/sqlite-vec-loader';
import { float32Blob } from '../../db/types/float32-blob';
import type { VectorEntry } from './abstract-vector-database';
import { DrizzleSqliteVectorDatabase } from './drizzle-sqlite-vector-database';

// Test schema
const EMBED_DIM = 1536;
const embeddings = sqliteTable('embeddings', {
  createdAt: integer('created_at')
    .notNull()
    .default(Math.floor(Date.now() / 1000)),
  embedding: float32Blob(EMBED_DIM)('embedding'),
  id: text('id').primaryKey(),
  metadata: text('metadata'),
  namespace: text('namespace').notNull(),
});

// Mock better-sqlite3 Database
const mockDatabase = {
  exec: vi.fn(),
  loadExtension: vi.fn(),
  pragma: vi.fn(),
  prepare: vi.fn(),
  transaction: vi.fn(),
};

// Mock drizzle database
const mockDrizzleDb = {
  driver: {
    database: mockDatabase as unknown as Database.Database,
  },
};

// Mock sqlite-vec-loader
vi.mock('../../db/sqlite-vec-loader', () => ({
  loadSqliteVec: vi.fn(),
}));

describe('DrizzleSqliteVectorDatabase', () => {
  let vectorDb: DrizzleSqliteVectorDatabase<{ title: string; chunk: number }>;
  const contentStore = new Map<string, string>();

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    contentStore.clear();

    vectorDb = new DrizzleSqliteVectorDatabase({
      columns: {
        embedding: embeddings.embedding,
        id: embeddings.id,
        metadata: embeddings.metadata,
        namespace: embeddings.namespace,
      },
      db: mockDrizzleDb,
      dim: EMBED_DIM,
      getContent: (namespace, ids) =>
        Promise.resolve(
          ids.map((id) => contentStore.get(`${namespace}:${id}`) ?? null)
        ),
      table: embeddings,
    });
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(vectorDb).toBeInstanceOf(DrizzleSqliteVectorDatabase);
    });

    it('should load sqlite-vec extension', () => {
      // The extension loading is mocked, so we just verify the constructor works
      expect(loadSqliteVec).toHaveBeenCalled();
    });
  });

  describe('ensureIndexes', () => {
    it('should create vec0 virtual table without unsupported indexes', () => {
      vectorDb.ensureIndexes();

      expect(mockDatabase.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIRTUAL TABLE IF NOT EXISTS')
      );
      expect(mockDatabase.exec).not.toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS')
      );
    });
  });

  describe('upsert', () => {
    const testEntries: VectorEntry<
      number[],
      { title: string; chunk: number },
      true,
      true
    >[] = [
      {
        id: 'doc:1#0',
        metadata: { chunk: 0, title: 'Test Doc' },
        vector: Array.from({ length: EMBED_DIM }, () => 0.1),
      },
      {
        id: 'doc:1#1',
        metadata: { chunk: 1, title: 'Test Doc' },
        vector: Array.from({ length: EMBED_DIM }, () => 0.2),
      },
    ];

    it('should validate vector dimensions', async () => {
      const invalidEntry = {
        id: 'invalid',
        metadata: { chunk: 0, title: 'Test' },
        vector: Array.from({ length: 100 }, () => 0), // Wrong dimension
      };

      await expect(
        vectorDb.upsert('test-namespace', [invalidEntry])
      ).rejects.toThrow('dimension mismatch');
    });

    it('should handle empty entries', async () => {
      await expect(
        vectorDb.upsert('test-namespace', [])
      ).resolves.toBeUndefined();
    });

    it('should upsert entries successfully', async () => {
      const mockStatement = {
        run: vi.fn(),
      };
      mockDatabase.prepare.mockReturnValue(mockStatement);

      const mockTransactionFn = vi.fn();
      mockDatabase.transaction.mockImplementation((callback) => {
        callback(); // Execute the callback to trigger prepare calls
        return mockTransactionFn;
      });

      await vectorDb.upsert('test-namespace', testEntries);

      expect(mockDatabase.transaction).toHaveBeenCalled();
      expect(mockTransactionFn).toHaveBeenCalled();
      expect(mockDatabase.prepare).toHaveBeenCalledTimes(3); // baseInsert, vecDelete, and vecInsert
    });
  });

  describe('query', () => {
    const queryVector = Array.from({ length: EMBED_DIM }, () => 0.5);

    it('should validate query vector dimensions', async () => {
      const invalidVector = Array.from({ length: 100 }, () => 0); // Wrong dimension

      await expect(
        vectorDb.query('test-namespace', invalidVector, 2)
      ).rejects.toThrow('dimension mismatch');
    });

    it('should query vectors successfully', async () => {
      const mockVecStatement = {
        all: vi.fn().mockReturnValue([
          { distance: 0.1, id: 'doc:1#0', namespace: 'test-namespace' },
          { distance: 0.2, id: 'doc:1#1', namespace: 'test-namespace' },
        ]),
      };

      const mockBaseStatement = {
        all: vi.fn().mockReturnValue([
          {
            embedding: Buffer.from(
              new Float32Array(Array.from({ length: EMBED_DIM }, () => 0.1))
                .buffer
            ),
            id: 'doc:1#0',
            metadata: JSON.stringify({ chunk: 0, title: 'Test Doc' }),
          },
          {
            embedding: Buffer.from(
              new Float32Array(Array.from({ length: EMBED_DIM }, () => 0.2))
                .buffer
            ),
            id: 'doc:1#1',
            metadata: JSON.stringify({ chunk: 1, title: 'Test Doc' }),
          },
        ]),
      };

      mockDatabase.prepare
        .mockReturnValueOnce(mockVecStatement) // vec0 query
        .mockReturnValueOnce(mockBaseStatement); // base table query

      const results = await vectorDb.query('test-namespace', queryVector, 2);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('id', 'doc:1#0');
      expect(results[1]).toHaveProperty('id', 'doc:1#1');
    });
  });

  describe('list', () => {
    it('should handle empty ids array', async () => {
      const results = await vectorDb.list('test-namespace', []);

      expect(results).toHaveLength(0);
    });

    it('should list entries by ids', async () => {
      const mockStatement = {
        all: vi.fn().mockReturnValue([
          {
            embedding: Buffer.from(
              new Float32Array(Array.from({ length: EMBED_DIM }, () => 0.1))
                .buffer
            ),
            id: 'doc:1#0',
            metadata: JSON.stringify({ chunk: 0, title: 'Test Doc' }),
          },
          {
            embedding: Buffer.from(
              new Float32Array(Array.from({ length: EMBED_DIM }, () => 0.2))
                .buffer
            ),
            id: 'doc:1#1',
            metadata: JSON.stringify({ chunk: 1, title: 'Test Doc' }),
          },
        ]),
      };
      mockDatabase.prepare.mockReturnValue(mockStatement);

      const results = await vectorDb.list('test-namespace', [
        'doc:1#0',
        'doc:1#1',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('id', 'doc:1#0');
      expect(results[1]).toHaveProperty('id', 'doc:1#1');
    });
  });

  describe('delete', () => {
    it('should handle empty ids array', async () => {
      await expect(
        vectorDb.delete('test-namespace', [])
      ).resolves.toBeUndefined();
    });

    it('should delete entries by ids', async () => {
      const mockStatement = {
        run: vi.fn(),
      };
      mockDatabase.prepare.mockReturnValue(mockStatement);

      const mockTransactionFn = vi.fn();
      mockDatabase.transaction.mockImplementation((callback) => {
        callback(); // Execute the callback to trigger prepare calls
        return mockTransactionFn;
      });

      await vectorDb.delete('test-namespace', ['doc:1#0', 'doc:1#1']);

      expect(mockDatabase.transaction).toHaveBeenCalled();
      expect(mockTransactionFn).toHaveBeenCalled();
      expect(mockDatabase.prepare).toHaveBeenCalledTimes(2); // baseDelete and vecDelete
    });
  });

  describe('error handling', () => {
    it('should throw error for unsupported driver', () => {
      const invalidDb = {};

      expect(
        () =>
          new DrizzleSqliteVectorDatabase({
            columns: {
              embedding: embeddings.embedding,
              id: embeddings.id,
              metadata: embeddings.metadata,
              namespace: embeddings.namespace,
            },
            db: invalidDb,
            dim: EMBED_DIM,
            getContent: (namespace, ids) =>
              Promise.resolve(
                ids.map((id) => contentStore.get(`${namespace}:${id}`) ?? null)
              ),
            table: embeddings,
          })
      ).toThrow('requires better-sqlite3 driver');
    });
  });

  describe('integration with RagService', () => {
    it('should be compatible with AbstractVectorDatabase interface', () => {
      // This test ensures our implementation matches the expected interface
      expect(vectorDb).toHaveProperty('upsert');
      expect(vectorDb).toHaveProperty('query');
      expect(vectorDb).toHaveProperty('list');
      expect(vectorDb).toHaveProperty('getContent');
      expect(vectorDb).toHaveProperty('delete');
      expect(vectorDb).toHaveProperty('ensureIndexes');
    });
  });
});
