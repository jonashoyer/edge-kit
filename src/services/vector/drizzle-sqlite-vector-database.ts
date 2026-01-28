/** biome-ignore-all lint/suspicious/useAwait: better-sqlite3 is sync */
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { loadSqliteVec } from "../../db/sqlite-vec-loader";
import { CustomError } from "../../utils/custom-error";
import {
  AbstractVectorDatabase,
  type VectorDatabaseOptions,
  type VectorEntry,
  type VectorQueryOptions,
} from "./abstract-vector-database";

type DrizzleDatabase = BetterSQLite3Database<any>;

export interface DrizzleSqliteVectorOptions extends VectorDatabaseOptions {
  db: DrizzleDatabase;
  table: SQLiteTable;
  columns: {
    id: any;
    namespace: any;
    embedding: any;
    metadata: any;
  };
  dim: number;
  vecTableName?: string; // defaults to `${tableName}_vec`
  extensionPath?: string;
}

/**
 * @deprecated Use `LibSQLVector` from `@mastra/core/vector/libsql` instead
 */
export class DrizzleSqliteVectorDatabase<
  TMetadata = Record<string, any>,
> extends AbstractVectorDatabase<TMetadata, number[]> {
  private readonly db: DrizzleDatabase;
  private readonly table: SQLiteTable;
  private readonly columns: DrizzleSqliteVectorOptions["columns"];
  private readonly dim: number;
  private readonly vecTableName: string;
  private readonly sqlite: Database.Database;

  constructor(options: DrizzleSqliteVectorOptions) {
    super(options);
    this.db = options.db;
    this.table = options.table;
    this.columns = options.columns;
    this.dim = options.dim;
    this.vecTableName = options.vecTableName ?? `${this.table._.name}_vec`;

    // Extract better-sqlite3 instance
    this.sqlite = this.extractSqliteInstance(options.db);

    try {
      loadSqliteVec(this.sqlite, { extensionPath: options.extensionPath });
    } catch (error) {
      throw new CustomError(
        `Failed to initialize sqlite-vec: ${error instanceof Error ? error.message : "Unknown error"}`,
        "SQLITE_VEC_INIT_ERROR"
      );
    }
  }

  /**
   * Extracts the underlying better-sqlite3 instance from Drizzle database.
   */
  private extractSqliteInstance(db: DrizzleDatabase): Database.Database {
    // Check if it's a BetterSQLite3Database
    if (
      "driver" in db &&
      db.driver &&
      typeof db.driver === "object" &&
      "database" in db.driver
    ) {
      return db.driver.database as Database.Database;
    }
    throw new CustomError(
      "DrizzleSqliteVectorDatabase requires better-sqlite3 driver",
      "UNSUPPORTED_DRIVER"
    );
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
        `Failed to create vector indexes: ${error instanceof Error ? error.message : "Unknown error"}`,
        "INDEX_CREATION_ERROR"
      );
    }
  }

  async upsert(
    namespace: string,
    entries: VectorEntry<number[], TMetadata, true, true>[]
  ): Promise<void> {
    if (entries.length === 0) return Promise.resolve();

    // Validate dimensions
    for (const entry of entries) {
      if (entry.vector.length !== this.dim) {
        throw new CustomError(
          `Vector dimension mismatch: expected ${this.dim}, got ${entry.vector.length}`,
          "DIMENSION_MISMATCH"
        );
      }
    }

    const transaction = this.sqlite.transaction(() => {
      // Prepare statements for base table and vec table
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

      const vecDelete = this.sqlite.prepare(`
        DELETE FROM ${this.vecTableName} WHERE id = ?
      `);

      const vecInsert = this.sqlite.prepare(`
        INSERT INTO ${this.vecTableName} (id, namespace, embedding)
        VALUES (?, ?, ?)
      `);

      // Execute inserts
      for (const entry of entries) {
        const embeddingBuffer = Buffer.from(
          new Float32Array(entry.vector).buffer
        );
        const metadataJson = JSON.stringify(entry.metadata ?? null);

        baseInsert.run(entry.id, namespace, embeddingBuffer, metadataJson);
        const vecId = `${namespace}:${entry.id}`;
        vecDelete.run(vecId);
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
        `Failed to upsert vectors: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPSERT_ERROR"
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
        "DIMENSION_MISMATCH"
      );
    }

    const includeVectors = opts?.includeVectors ?? false;
    const includeMetadata = opts?.includeMetadata ?? false;

    try {
      // Query the vec0 virtual table for nearest neighbors
      const vecQuery = this.sqlite.prepare(`
        SELECT id, namespace, distance
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
      ) as Array<{
        id: string;
        namespace: string;
        distance: number;
      }>;

      if (vecResults.length === 0) {
        return Promise.resolve([]);
      }

      // If no additional data needed, return vec results
      if (!(includeVectors || includeMetadata)) {
        return vecResults.map((result) => {
          const entry: any = { id: result.id };
          if (includeVectors) entry.vector = undefined;
          if (includeMetadata) entry.metadata = undefined;
          return entry;
        }) as VectorEntry<number[], TMetadata, TIncludeVectors>[];
      }

      // Fetch additional data from base table
      const ids = vecResults.map((r) => r.id);
      const originalIds = ids.map((id) =>
        id.includes(":") ? id.split(":").slice(1).join(":") : id
      );
      const placeholders = originalIds.map(() => "?").join(",");

      const selectFields = ["id"];
      if (includeVectors) selectFields.push("embedding");
      if (includeMetadata) selectFields.push("metadata");

      const baseQuery = this.sqlite.prepare(`
        SELECT ${selectFields.join(", ")}
        FROM ${this.table._.name}
        WHERE id IN (${placeholders}) AND namespace = ?
      `);

      const baseResults = baseQuery.all(...originalIds, namespace) as Array<{
        id: string;
        embedding?: Buffer;
        metadata?: string;
      }>;

      // Create lookup map
      const baseMap = new Map(
        baseResults.map((row) => [
          row.id,
          {
            vector:
              includeVectors && row.embedding
                ? Array.from(
                    new Float32Array(
                      row.embedding.buffer,
                      row.embedding.byteOffset,
                      row.embedding.byteLength / 4
                    )
                  )
                : undefined,
            metadata:
              includeMetadata && row.metadata
                ? (JSON.parse(row.metadata) as TMetadata)
                : undefined,
          },
        ])
      );

      // Combine results maintaining vec0 order
      return vecResults.map((vecResult) => {
        // Extract original ID from namespace-prefixed ID
        const originalId = vecResult.id.includes(":")
          ? vecResult.id.split(":").slice(1).join(":")
          : vecResult.id;
        const baseData = baseMap.get(originalId);
        const entry: any = { id: originalId };
        if (includeVectors) entry.vector = baseData?.vector;
        if (includeMetadata) entry.metadata = baseData?.metadata;
        return entry;
      }) as VectorEntry<number[], TMetadata, TIncludeVectors>[];
    } catch (error) {
      throw new CustomError(
        `Failed to query vectors: ${error instanceof Error ? error.message : "Unknown error"}`,
        "QUERY_ERROR"
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
    if (ids.length === 0) return Promise.resolve([]);

    const includeVectors = opts?.includeVectors ?? false;
    const includeMetadata = opts?.includeMetadata ?? false;

    try {
      const placeholders = ids.map(() => "?").join(",");

      // Use raw SQL to avoid type conflicts
      const selectFields = ["id"];
      if (includeVectors) selectFields.push("embedding");
      if (includeMetadata) selectFields.push("metadata");

      const results = this.sqlite
        .prepare(`
        SELECT ${selectFields.join(", ")}
        FROM ${this.table._.name}
        WHERE id IN (${placeholders}) AND namespace = ?
      `)
        .all(...ids, namespace) as Array<{
        id: string;
        embedding?: Buffer;
        metadata?: string;
      }>;

      // Create lookup map
      const resultMap = new Map(
        results.map((row) => [
          row.id,
          {
            id: row.id,
            vector:
              includeVectors && row.embedding
                ? Array.from(
                    new Float32Array(
                      row.embedding.buffer,
                      row.embedding.byteOffset,
                      row.embedding.byteLength / 4
                    )
                  )
                : undefined,
            metadata:
              includeMetadata && row.metadata
                ? (JSON.parse(row.metadata) as TMetadata)
                : undefined,
          },
        ])
      );

      // Return results in requested order, null for missing ids
      return ids.map((id) => resultMap.get(id) ?? null) as (VectorEntry<
        number[],
        TMetadata,
        TIncludeVectors,
        TIncludeMetadata
      > | null)[];
    } catch (error) {
      throw new CustomError(
        `Failed to list vectors: ${error instanceof Error ? error.message : "Unknown error"}`,
        "LIST_ERROR"
      );
    }
  }

  async delete(namespace: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return Promise.resolve();

    try {
      const transaction = this.sqlite.transaction(() => {
        // Delete from base table
        const baseDelete = this.sqlite.prepare(`
          DELETE FROM ${this.table._.name}
          WHERE id IN (${ids.map(() => "?").join(",")}) AND namespace = ?
        `);
        baseDelete.run(...ids, namespace);

        // Delete from vec table using namespace-prefixed IDs
        const vecIds = ids.map((id) => `${namespace}:${id}`);
        const vecDelete = this.sqlite.prepare(`
          DELETE FROM ${this.vecTableName}
          WHERE id IN (${vecIds.map(() => "?").join(",")})
        `);
        vecDelete.run(...vecIds);
      });

      transaction();
    } catch (error) {
      throw new CustomError(
        `Failed to delete vectors: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DELETE_ERROR"
      );
    }
  }
}
