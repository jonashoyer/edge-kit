import { eq, inArray } from 'drizzle-orm';
import { AbstractKeyValueService } from './abstract-key-value';
import { Nullable } from '../../utils/type-utils';
import { CreateColumnConfig, CreateTableConfig, SqlFlavorOptions, AnyMySqlDatabase, AnyPostgresDatabase, AnySQLiteDatabase, DefaultSchema } from '../../database/types';
import { is } from 'drizzle-orm';
import { MySqlDatabase, MySqlTableWithColumns } from 'drizzle-orm/mysql-core';
import { PgDatabase, PgTableWithColumns } from 'drizzle-orm/pg-core';
import { BaseSQLiteDatabase, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';

export type BaseKeyValueTable<Dialect extends "mysql" | "pg" | "sqlite"> = CreateTableConfig<{
  key: CreateColumnConfig<{
    data: string
    dataType: "string"
    isPrimaryKey: true
    notNull: true
  }, Dialect>
  value: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  expiresAt: CreateColumnConfig<{
    data: number
    dataType: "number"
    notNull: false
  }, Dialect>
}, Dialect>


export type MySqlKeyValueTable = MySqlTableWithColumns<BaseKeyValueTable<"mysql">>;
export type PostgresKeyValueTable = PgTableWithColumns<BaseKeyValueTable<"pg">>;
export type SQLiteKeyValueTable = SQLiteTableWithColumns<BaseKeyValueTable<"sqlite">>;


class BaseDrizzleKeyValueService<SqlFlavor extends SqlFlavorOptions> extends AbstractKeyValueService {

  // Force a flavor for semi type safety
  private _db: AnySQLiteDatabase;
  private _table: SQLiteKeyValueTable;
  private expireDiscoveryDeletion: boolean = false;

  constructor(
    db: SqlFlavor,
    table: DefaultSchema<
      SqlFlavor,
      { kv: MySqlKeyValueTable },
      { kv: PostgresKeyValueTable },
      { kv: SQLiteKeyValueTable }
    >['kv']
  ) {
    super();
    this._db = db as AnySQLiteDatabase;
    this._table = table as SQLiteKeyValueTable;
  }

  async get<T>(key: string): Promise<Nullable<T>> {
    const now = Math.floor(Date.now() / 1000);

    const result = await this._db
      .select()
      .from(this._table as any)
      .where(eq(this._table.key, key))
      .get()

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
    const now = Math.floor(Date.now() / 1000);

    const results = await this._db
      .select()
      .from(this._table)
      .where(inArray(this._table.key, keys))

    if (this.expireDiscoveryDeletion) {
      const deleteItems = results.filter(result => result.expiresAt && result.expiresAt < now);

      if (deleteItems.length > 0) {
        await this._db
          .delete(this._table)
          .where(inArray(this._table.key, deleteItems.map(item => item.key)));
      }
    }

    return results.map(result => {
      if (result.expiresAt && result.expiresAt < now) {
        return null;
      }
      return JSON.parse(result.value) as T;
    });
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    throw new Error('Not implemented');
  }

  async delete(key: string): Promise<void> {
    await this._db
      .delete(this._table)
      .where(eq(this._table.key, key))
  }

  async exists(key: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);

    const result = await this._db.select({ key: this._table.key, expiresAt: this._table.expiresAt })
      .from(this._table)
      .where(eq(this._table.key, key))
      .get()

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

  async increment(key: string, amount: number = 1): Promise<number> {
    const value = await this.get<number>(key);
    const newValue = (value || 0) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
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

    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    await this._db
      .update(this._table)
      .set({ expiresAt })
      .where(eq(this._table.key, key))

    return true;
  }


  zadd(key: string, score: number, member: string): Promise<void> {
    throw new Error('Unsupported operation');
  }

  zrank(key: string, member: string): Promise<number | null> {
    throw new Error('Unsupported operation');
  }

  zcard(key: string): Promise<number> {
    throw new Error('Unsupported operation');
  }

  zrange(key: string, start: number, stop: number): Promise<string[]> {
    throw new Error('Unsupported operation');
  }

  zrem(key: string, member: string | string[]): Promise<void> {
    throw new Error('Unsupported operation');
  }

  mdelete(keys: string[]): Promise<void> {
    throw new Error('Unsupported operation');
  }
}

class MySqlKeyValueService extends BaseDrizzleKeyValueService<AnyMySqlDatabase> {
  private db: AnyMySqlDatabase;
  private table: MySqlKeyValueTable;

  constructor(db: AnyMySqlDatabase, table: MySqlKeyValueTable) {
    super(db, table);
    this.db = db;
    this.table = table;
  }

  override async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / 1000) + ttlSeconds
      : null;

    await this.db
      .insert(this.table)
      .values({
        key,
        value: JSON.stringify(value),
        expiresAt
      })
      .onDuplicateKeyUpdate({
        set: {
          value: JSON.stringify(value),
          expiresAt
        }
      })
      .execute();
  }

}

class PostgresKeyValueService extends BaseDrizzleKeyValueService<AnyPostgresDatabase> {
  private db: AnyPostgresDatabase;
  private table: PostgresKeyValueTable;

  constructor(db: AnyPostgresDatabase, table: PostgresKeyValueTable) {
    super(db, table);
    this.db = db;
    this.table = table;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / 1000) + ttlSeconds
      : null;

    // Using upsert for PostgreSQL
    await this.db
      .insert(this.table)
      .values({
        key,
        value: JSON.stringify(value),
        expiresAt
      })
      .onConflictDoUpdate({
        target: this.table.key,
        set: {
          value: JSON.stringify(value),
          expiresAt
        }
      });
  }
}

// SQLite implementation
class SQLiteKeyValueService extends BaseDrizzleKeyValueService<AnySQLiteDatabase> {
  private db: AnySQLiteDatabase;
  private table: SQLiteKeyValueTable;

  constructor(db: AnySQLiteDatabase, table: SQLiteKeyValueTable) {
    super(db, table);
    this.db = db;
    this.table = table;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds
      ? Math.floor(Date.now() / 1000) + ttlSeconds
      : null;

    await this.db
      .insert(this.table)
      .values({
        key,
        value: JSON.stringify(value),
        expiresAt
      })
      .onConflictDoUpdate({
        target: this.table.key,
        set: {
          value: JSON.stringify(value),
          expiresAt
        }
      });
  }
}

export function DrizzleKeyValueService<SqlFlavor extends SqlFlavorOptions>(
  db: SqlFlavor,
  table: DefaultSchema<
    SqlFlavor,
    { kv: MySqlKeyValueTable },
    { kv: PostgresKeyValueTable },
    { kv: SQLiteKeyValueTable }
  >['kv']
): AbstractKeyValueService {
  if (is(db, MySqlDatabase)) {
    return new MySqlKeyValueService(db, table as any);
  } else if (is(db, PgDatabase)) {
    return new PostgresKeyValueService(db, table as any);
  } else if (is(db, BaseSQLiteDatabase)) {
    return new SQLiteKeyValueService(db, table as any);
  }

  throw new Error(`Unsupported database type (${typeof db}) in DrizzleKeyValue adapter.`);
} 