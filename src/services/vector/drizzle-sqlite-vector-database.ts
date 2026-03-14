/** biome-ignore-all lint/suspicious/useAwait: better-sqlite3 is sync */
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { loadSqliteVec } from '../../db/sqlite-vec-loader';
import { CustomError } from '../../utils/custom-error';
import {
  AbstractVectorDatabase,
  type VectorContentProvider,
  type VectorDatabaseOptions,
  type VectorEntry,
  type VectorQueryOptions,
} from './abstract-vector-database';

type DrizzleDatabase = BetterSQLite3Database<Record<string, never>> &
  Partial<{
    $client: Database.Database;
    driver: {
      database: Database.Database;
    };
  }>;

type SqliteVectorColumn = Pick<AnySQLiteColumn, 'name'>;

type DrizzleSqliteVectorColumns = {
  id: SqliteVectorColumn;
  namespace: SqliteVectorColumn;
  embedding: SqliteVectorColumn;
  metadata: SqliteVectorColumn;
};

type VecQueryRow = {
  id: string;
  distance: number;
};

type BaseQueryRow = {
  id: string;
  embedding?: Buffer | null;
  metadata?: string | null;
};

type LoadedVectorEntry<TMetadata> = {
  vector?: number[];
  metadata?: TMetadata;
};

export interface DrizzleSqliteVectorOptions
  extends VectorDatabaseOptions<true> {
  db: DrizzleDatabase;
  table: SQLiteTable;
  columns: DrizzleSqliteVectorColumns;
  dim: number;
  vecTableName?: string; // defaults to `${tableName}_vec`
  extensionPath?: string;
}

/**
 * @deprecated Use `LibSQLVector` from `@mastra/core/vector/libsql` instead
 */
export class DrizzleSqliteVectorDatabase<
  TMetadata = Record<string, unknown>,
> extends AbstractVectorDatabase<TMetadata, number[], true> {
  readonly getContent: VectorContentProvider;
  private readonly table: SQLiteTable;
  private readonly columns: DrizzleSqliteVectorColumns;
  private readonly dim: number;
  private readonly vecTableName: string;
  private readonly sqlite: Database.Database;

  constructor(options: DrizzleSqliteVectorOptions) {
    super(options);
    this.getContent = options.getContent;
    this.table = options.table;
    this.columns = options.columns;
    this.dim = options.dim;
    this.vecTableName = options.vecTableName ?? `${this.table._.name}_vec`;
    this.sqlite = this.extractSqliteInstance(options.db);

    try {
      loadSqliteVec(this.sqlite, { extensionPath: options.extensionPath });
    } catch (error) {
      throw new CustomError(
        `Failed to initialize sqlite-vec: ${DrizzleSqliteVectorDatabase.getErrorMessage(error)}`,
        'SQLITE_VEC_INIT_ERROR'
      );
    }
  }

  private static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  /**
   * Extracts the underlying better-sqlite3 instance from a Drizzle database.
   */
  private extractSqliteInstance(db: DrizzleDatabase): Database.Database {
    if ('$client' in db && db.$client) {
      return db.$client;
    }

    if ('driver' in db && db.driver?.database) {
      return db.driver.database;
    }

    throw new CustomError(
      'DrizzleSqliteVectorDatabase requires better-sqlite3 driver',
      'UNSUPPORTED_DRIVER'
    );
  }

  private static serializeVector(vector: number[]): Buffer {
    return Buffer.from(new Float32Array(vector).buffer);
  }

  private static deserializeVector(
    buffer: Buffer | null | undefined
  ): number[] | undefined {
    if (!buffer) {
      return undefined;
    }

    return Array.from(
      new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
      )
    );
  }

  private static getOriginalId(namespace: string, id: string): string {
    const prefix = `${namespace}:`;
    if (!id.startsWith(prefix)) {
      return id;
    }

    return id.slice(prefix.length);
  }

  private static getVecId(namespace: string, id: string): string {
    return `${namespace}:${id}`;
  }

  private buildVectorEntry<
    TIncludeVectors extends boolean,
    TIncludeMetadata extends boolean,
  >(
    id: string,
    includeVectors: TIncludeVectors,
    includeMetadata: TIncludeMetadata,
    data?: LoadedVectorEntry<TMetadata>
  ): VectorEntry<number[], TMetadata, TIncludeVectors, TIncludeMetadata> {
    const entry: {
      id: string;
      vector?: number[];
      metadata?: TMetadata;
    } = { id };

    if (includeVectors) {
      entry.vector = data?.vector;
    }

    if (includeMetadata) {
      entry.metadata = data?.metadata;
    }

    return entry as VectorEntry<
      number[],
      TMetadata,
      TIncludeVectors,
      TIncludeMetadata
    >;
  }

  /**
   * Ensures the vec0 virtual table exists.
   * Should be called after database schema is set up.
   * Note: Virtual tables cannot have indexes in SQLite.
   */
  ensureIndexes(): void {
    const vecTableSql = `
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.vecTableName} USING vec0(
        id TEXT PRIMARY KEY,
        namespace TEXT,
        embedding float[${this.dim}]
      )
    `;

    try {
      this.sqlite.exec(vecTableSql);
    } catch (error) {
      throw new CustomError(
        `Failed to create vector indexes: ${DrizzleSqliteVectorDatabase.getErrorMessage(error)}`,
        'INDEX_CREATION_ERROR'
      );
    }
  }

  async upsert(
    namespace: string,
    entries: VectorEntry<number[], TMetadata, true, true>[]
  ): Promise<void> {
    if (entries.length === 0) {
      return Promise.resolve();
    }

    for (const entry of entries) {
      if (entry.vector.length !== this.dim) {
        throw new CustomError(
          `Vector dimension mismatch: expected ${this.dim}, got ${entry.vector.length}`,
          'DIMENSION_MISMATCH'
        );
      }
    }

    const transaction = this.sqlite.transaction(() => {
      const idCol = this.columns.id.name;
      const nsCol = this.columns.namespace.name;
      const embCol = this.columns.embedding.name;
      const metaCol = this.columns.metadata.name;

      const baseInsert = this.sqlite.prepare(`
        INSERT INTO ${this.table._.name} (${idCol}, ${nsCol}, ${embCol}, ${metaCol})
        VALUES (?, ?, ?, ?)
        ON CONFLICT(${idCol}) DO UPDATE SET
          ${nsCol} = excluded.${nsCol},
          ${embCol} = excluded.${embCol},
          ${metaCol} = excluded.${metaCol}
      `);

      const vecInsert = this.sqlite.prepare(`
        INSERT OR REPLACE INTO ${this.vecTableName} (id, namespace, embedding)
        VALUES (?, ?, ?)
      `);

      for (const entry of entries) {
        const embeddingBuffer = DrizzleSqliteVectorDatabase.serializeVector(
          entry.vector
        );
        const metadataJson = JSON.stringify(entry.metadata ?? null);
        const vecId = DrizzleSqliteVectorDatabase.getVecId(namespace, entry.id);

        baseInsert.run(entry.id, namespace, embeddingBuffer, metadataJson);
        vecInsert.run(
          vecId,
          namespace,
          JSON.stringify(Array.from(entry.vector))
        );
      }
    });

    try {
      transaction();
    } catch (error) {
      throw new CustomError(
        `Failed to upsert vectors: ${DrizzleSqliteVectorDatabase.getErrorMessage(error)}`,
        'UPSERT_ERROR'
      );
    }
  }

  async query<
    TIncludeVectors extends boolean,
    TIncludeMetadata extends boolean,
  >(
    namespace: string,
    vector: number[],
    topK: number,
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<VectorEntry<number[], TMetadata, TIncludeVectors>[]> {
    if (vector.length !== this.dim) {
      throw new CustomError(
        `Query vector dimension mismatch: expected ${this.dim}, got ${vector.length}`,
        'DIMENSION_MISMATCH'
      );
    }

    const includeVectors = opts?.includeVectors ?? false;
    const includeMetadata = opts?.includeMetadata ?? false;

    try {
      const vecQuery = this.sqlite.prepare(`
        SELECT id, distance
        FROM ${this.vecTableName}
        WHERE namespace = ?
          AND embedding MATCH ?
        ORDER BY distance ASC
        LIMIT ?
      `);

      const vecResults = vecQuery.all(
        namespace,
        JSON.stringify(vector),
        topK
      ) as VecQueryRow[];

      if (vecResults.length === 0) {
        return Promise.resolve([]);
      }

      if (!(includeVectors || includeMetadata)) {
        return vecResults.map((result) =>
          this.buildVectorEntry(
            DrizzleSqliteVectorDatabase.getOriginalId(namespace, result.id),
            includeVectors,
            includeMetadata
          )
        ) as VectorEntry<number[], TMetadata, TIncludeVectors>[];
      }

      const originalIds = vecResults.map((result) =>
        DrizzleSqliteVectorDatabase.getOriginalId(namespace, result.id)
      );
      const placeholders = originalIds.map(() => '?').join(',');

      const selectFields = ['id'];
      if (includeVectors) {
        selectFields.push('embedding');
      }
      if (includeMetadata) {
        selectFields.push('metadata');
      }

      const baseQuery = this.sqlite.prepare(`
        SELECT ${selectFields.join(', ')}
        FROM ${this.table._.name}
        WHERE id IN (${placeholders}) AND namespace = ?
      `);

      const baseResults = baseQuery.all(
        ...originalIds,
        namespace
      ) as BaseQueryRow[];

      const baseMap = new Map<string, LoadedVectorEntry<TMetadata>>(
        baseResults.map((row) => [
          row.id,
          {
            vector: includeVectors
              ? DrizzleSqliteVectorDatabase.deserializeVector(row.embedding)
              : undefined,
            metadata:
              includeMetadata && row.metadata
                ? (JSON.parse(row.metadata) as TMetadata)
                : undefined,
          },
        ])
      );

      return vecResults.map((vecResult) => {
        const originalId = DrizzleSqliteVectorDatabase.getOriginalId(
          namespace,
          vecResult.id
        );

        return this.buildVectorEntry(
          originalId,
          includeVectors,
          includeMetadata,
          baseMap.get(originalId)
        );
      }) as VectorEntry<number[], TMetadata, TIncludeVectors>[];
    } catch (error) {
      throw new CustomError(
        `Failed to query vectors: ${DrizzleSqliteVectorDatabase.getErrorMessage(error)}`,
        'QUERY_ERROR'
      );
    }
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
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    const includeVectors = opts?.includeVectors ?? false;
    const includeMetadata = opts?.includeMetadata ?? false;

    try {
      const placeholders = ids.map(() => '?').join(',');
      const selectFields = ['id'];

      if (includeVectors) {
        selectFields.push('embedding');
      }
      if (includeMetadata) {
        selectFields.push('metadata');
      }

      const results = this.sqlite
        .prepare(`
        SELECT ${selectFields.join(', ')}
        FROM ${this.table._.name}
        WHERE id IN (${placeholders}) AND namespace = ?
      `)
        .all(...ids, namespace) as BaseQueryRow[];

      const resultMap = new Map<
        string,
        VectorEntry<number[], TMetadata, TIncludeVectors, TIncludeMetadata>
      >(
        results.map((row) => [
          row.id,
          this.buildVectorEntry(row.id, includeVectors, includeMetadata, {
            vector: includeVectors
              ? DrizzleSqliteVectorDatabase.deserializeVector(row.embedding)
              : undefined,
            metadata:
              includeMetadata && row.metadata
                ? (JSON.parse(row.metadata) as TMetadata)
                : undefined,
          }),
        ])
      );

      return ids.map((id) => resultMap.get(id) ?? null);
    } catch (error) {
      throw new CustomError(
        `Failed to list vectors: ${DrizzleSqliteVectorDatabase.getErrorMessage(error)}`,
        'LIST_ERROR'
      );
    }
  }

  async delete(namespace: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return Promise.resolve();
    }

    try {
      const transaction = this.sqlite.transaction(() => {
        const baseDelete = this.sqlite.prepare(`
          DELETE FROM ${this.table._.name}
          WHERE id IN (${ids.map(() => '?').join(',')}) AND namespace = ?
        `);
        baseDelete.run(...ids, namespace);

        const vecIds = ids.map((id) =>
          DrizzleSqliteVectorDatabase.getVecId(namespace, id)
        );
        const vecDelete = this.sqlite.prepare(`
          DELETE FROM ${this.vecTableName}
          WHERE id IN (${vecIds.map(() => '?').join(',')})
        `);
        vecDelete.run(...vecIds);
      });

      transaction();
    } catch (error) {
      throw new CustomError(
        `Failed to delete vectors: ${DrizzleSqliteVectorDatabase.getErrorMessage(error)}`,
        'DELETE_ERROR'
      );
    }
  }
}
