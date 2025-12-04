import { eq, inArray, sql } from "drizzle-orm";
import type { MySqlTableWithColumns } from "drizzle-orm/mysql-core";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";

import {
  type AnyMySqlDatabase,
  type AnyPostgresDatabase,
  type AnySQLiteDatabase,
  type CreateColumnConfig,
  type CreateTableConfig,
  createDialectService,
} from "../../database/types";
import type { Nullable } from "../../utils/type-utils";
import { AbstractKeyValueService } from "./abstract-key-value";

export type BaseKeyValueTable<Dialect extends "mysql" | "pg" | "sqlite"> =
  CreateTableConfig<
    {
      key: CreateColumnConfig<
        Dialect,
        {
          data: string;
          dataType: "string";
          notNull: true;
        }
      >;
      value: CreateColumnConfig<
        Dialect,
        {
          // biome-ignore lint/suspicious/noExplicitAny: Any type
          data: any;
          dataType: "json";
          notNull: true;
        }
      >;
      expiresAt: CreateColumnConfig<
        Dialect,
        {
          data: number;
          dataType: "number";
          notNull: boolean;
        }
      >;
    },
    Dialect
  >;

export type MySqlKeyValueTable = MySqlTableWithColumns<
  BaseKeyValueTable<"mysql">
>;
export type PostgresKeyValueTable = PgTableWithColumns<BaseKeyValueTable<"pg">>;
export type SQLiteKeyValueTable = SQLiteTableWithColumns<
  BaseKeyValueTable<"sqlite">
>;

const MS_TO_SECONDS = 1000;

class BaseDrizzleKeyValueService<
  TDb extends AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  TTable extends
    | MySqlKeyValueTable
    | PostgresKeyValueTable
    | SQLiteKeyValueTable,
> extends AbstractKeyValueService {
  protected readonly _db: TDb;
  protected readonly _table: TTable;
  private readonly expireDiscoveryDeletion = false;
  private readonly _internal: {
    db: AnyMySqlDatabase;
    table: MySqlKeyValueTable;
  };

  constructor(db: TDb, table: TTable) {
    super();
    this._db = db;
    this._table = table;
    this._internal = {
      db: db as AnyMySqlDatabase,
      table: table as MySqlKeyValueTable,
    };
  }

  private async _get(key: string) {
    const { db, table } = this._internal;
    const rows = await db
      .select({
        key: table.key,
        value: table.value,
        expiresAt: table.expiresAt,
      })
      .from(table)
      .where(eq(table.key, key))
      .limit(1)
      .execute();
    return rows[0];
  }
  private async _getMany(keys: string[]) {
    const { db, table } = this._internal;
    const rows = await db
      .select({
        key: table.key,
        value: table.value,
        expiresAt: table.expiresAt,
      })
      .from(table)
      .where(inArray(table.key, keys))
      .execute();
    return rows;
  }

  private async _deleteManyByKeys(keys: string[]) {
    const { db, table } = this._internal;
    await db.delete(table).where(inArray(table.key, keys)).execute();
  }

  private async _updateExpiry(key: string, expiresAt: number) {
    const { db, table } = this._internal;
    await db
      .update(table)
      .set({ expiresAt })
      .where(eq(table.key, key))
      .execute();
  }

  async get<T>(key: string): Promise<Nullable<T>> {
    const now = Math.floor(Date.now() / MS_TO_SECONDS);

    const result = await this._get(key);

    if (!result) {
      return null;
    }

    if (result.expiresAt && result.expiresAt < now) {
      if (this.expireDiscoveryDeletion) {
        await this.delete(key);
      }
      return null;
    }

    return JSON.parse(result.value) as T;
  }

  async mget<T>(keys: string[]): Promise<Nullable<T>[]> {
    const now = Math.floor(Date.now() / MS_TO_SECONDS);

    const results = await this._getMany(keys);

    if (this.expireDiscoveryDeletion) {
      const deleteItems = results.filter(
        (result) => result.expiresAt && result.expiresAt < now
      );

      if (deleteItems.length > 0) {
        await this._deleteManyByKeys(deleteItems.map((d) => d.key));
      }
    }

    return results.map((result) => {
      if (result.expiresAt && result.expiresAt < now) {
        return null;
      }
      return JSON.parse(result.value) as T;
    });
  }

  set<T>(_key: string, _value: T, _ttlSeconds?: number): Promise<void> {
    throw new Error("Not implemented");
  }

  mset<T>(_keyValues: [string, T][], _ttlSeconds?: number): Promise<void> {
    throw new Error("Not implemented");
  }

  async delete(key: string): Promise<void> {
    await this._deleteManyByKeys([key]);
  }

  async exists(key: string): Promise<boolean> {
    const now = Math.floor(Date.now() / MS_TO_SECONDS);

    const result = await this._get(key);

    if (!result) {
      return false;
    }

    if (result.expiresAt && result.expiresAt < now) {
      if (this.expireDiscoveryDeletion) {
        await this.delete(key);
      }
      return false;
    }

    return true;
  }

  async increment(key: string, amount = 1): Promise<number> {
    const value = await this.get<number>(key);
    const newValue = (value || 0) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decrement(key: string, amount = 1): Promise<number> {
    const value = await this.get<number>(key);
    const newValue = (value || 0) - amount;
    await this.set(key, newValue);
    return newValue;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const exists = await this.exists(key);

    if (!exists) {
      return false;
    }

    const expiresAt = Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds;

    await this._updateExpiry(key, expiresAt);

    return true;
  }

  /**
   * @deprecated Unsupported operation
   */
  zadd(_key: string, _score: number, _member: string): Promise<void> {
    throw new Error("Unsupported operation");
  }

  /**
   * @deprecated Unsupported operation
   */
  zrank(_key: string, _member: string): Promise<number | null> {
    throw new Error("Unsupported operation");
  }

  /**
   * @deprecated Unsupported operation
   */
  zcard(_key: string): Promise<number> {
    throw new Error("Unsupported operation");
  }

  /**
   * @deprecated Unsupported operation
   */
  zrange(_key: string, _start: number, _stop: number): Promise<string[]> {
    throw new Error("Unsupported operation");
  }

  /**
   * @deprecated Unsupported operation
   */
  zrem(_key: string, _member: string | string[]): Promise<void> {
    throw new Error("Unsupported operation");
  }

  async mdelete(_keys: string[]): Promise<void> {
    if (_keys.length === 0) {
      return;
    }
    await this._deleteManyByKeys(_keys);
  }
}

class MySqlKeyValueService extends BaseDrizzleKeyValueService<
  AnyMySqlDatabase,
  MySqlKeyValueTable
> {
  override async set<T>(
    key: string,
    value: T,
    ttlSeconds?: number
  ): Promise<void> {
    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds
      : null;

    await this._db
      .insert(this._table)
      .values({
        key,
        value,
        expiresAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          value,
          expiresAt,
        },
      })
      .execute();
  }

  override async mset<T>(
    keyValues: [string, T][],
    ttlSeconds?: number
  ): Promise<void> {
    if (keyValues.length === 0) return;

    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds
      : null;

    await this._db
      .insert(this._table)
      .values(
        keyValues.map(([key, value]) => ({
          key,
          value,
          expiresAt,
        }))
      )
      .onDuplicateKeyUpdate({
        set: {
          value: sql`VALUES(${this._table.value})`,
          expiresAt: sql`VALUES(${this._table.expiresAt})`,
        },
      })
      .execute();
  }
}

class PostgresKeyValueService extends BaseDrizzleKeyValueService<
  AnyPostgresDatabase,
  PostgresKeyValueTable
> {
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds
      : null;

    // Using upsert for PostgreSQL
    await this._db
      .insert(this._table)
      .values({
        key,
        value,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: this._table.key,
        set: {
          value,
          expiresAt,
        },
      })
      .execute();
  }

  async mset<T>(keyValues: [string, T][], ttlSeconds?: number): Promise<void> {
    if (keyValues.length === 0) return;

    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds
      : null;

    await this._db
      .insert(this._table)
      .values(
        keyValues.map(([key, value]) => ({
          key,
          value,
          expiresAt,
        }))
      )
      .onConflictDoUpdate({
        target: this._table.key,
        set: {
          value: sql`excluded.value`,
          expiresAt: sql`excluded.expiresAt`,
        },
      })
      .execute();
  }
}

class SQLiteKeyValueService extends BaseDrizzleKeyValueService<
  AnySQLiteDatabase,
  SQLiteKeyValueTable
> {
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds
      : null;

    await this._db
      .insert(this._table)
      .values({
        key,
        value,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: this._table.key,
        set: {
          value,
          expiresAt,
        },
      })
      .run();
  }

  async mset<T>(keyValues: [string, T][], ttlSeconds?: number): Promise<void> {
    if (keyValues.length === 0) return;

    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / MS_TO_SECONDS) + ttlSeconds
      : null;

    await this._db
      .insert(this._table)
      .values(
        keyValues.map(([key, value]) => ({
          key,
          value,
          expiresAt,
        }))
      )
      .onConflictDoUpdate({
        target: this._table.key,
        set: {
          value: sql`excluded.value`,
          expiresAt: sql`excluded.expiresAt`,
        },
      })
      .run();
  }
}

export function DrizzleKeyValueService(
  db: AnyMySqlDatabase,
  table: MySqlKeyValueTable
): MySqlKeyValueService;
export function DrizzleKeyValueService(
  db: AnyPostgresDatabase,
  table: PostgresKeyValueTable
): PostgresKeyValueService;
export function DrizzleKeyValueService(
  db: AnySQLiteDatabase,
  table: SQLiteKeyValueTable
): SQLiteKeyValueService;
export function DrizzleKeyValueService(
  db: AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  table: MySqlKeyValueTable | PostgresKeyValueTable | SQLiteKeyValueTable
): AbstractKeyValueService {
  return createDialectService(db, table, {
    mysql: MySqlKeyValueService,
    pg: PostgresKeyValueService,
    sqlite: SQLiteKeyValueService,
  });
}
