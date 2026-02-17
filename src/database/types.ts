/** biome-ignore-all lint/suspicious/noExplicitAny: Let's just ignore this */
import { type GeneratedColumnConfig, is } from 'drizzle-orm';
import {
  type MySqlColumn,
  MySqlDatabase,
  type MySqlQueryResultHKT,
  type PreparedQueryHKTBase,
} from 'drizzle-orm/mysql-core';
import {
  type PgColumn,
  PgDatabase,
  type PgQueryResultHKT,
} from 'drizzle-orm/pg-core';
import { BaseSQLiteDatabase, type SQLiteColumn } from 'drizzle-orm/sqlite-core';

export type AnyPostgresDatabase = PgDatabase<PgQueryResultHKT, any>;
export type AnyMySqlDatabase = MySqlDatabase<
  MySqlQueryResultHKT,
  PreparedQueryHKTBase,
  any
>;
export type AnySQLiteDatabase = BaseSQLiteDatabase<'sync' | 'async', any, any>;

export type SqlFlavors =
  | AnyPostgresDatabase
  | AnyMySqlDatabase
  | AnySQLiteDatabase;

export type SqlFlavorToDialect<T extends SqlFlavors> =
  T extends AnyMySqlDatabase
    ? 'mysql'
    : T extends AnyPostgresDatabase
      ? 'pg'
      : T extends AnySQLiteDatabase
        ? 'sqlite'
        : never;

type BaseColumnConfig<T> = {
  name: string;
  isAutoincrement: boolean;
  isPrimaryKey: T extends { isPrimaryKey: true } ? true : false;
  hasRuntimeDefault: boolean;
  generated:
    | GeneratedColumnConfig<T extends { data: any } ? T['data'] : never>
    | undefined;
  data: T extends { data: any } ? T['data'] : never;
  driverParam: string | number | boolean;
  notNull: T extends { notNull: boolean } ? T['notNull'] : boolean;
  hasDefault: boolean;
  enumValues: any;
  dataType: T extends { dataType: string } ? T['dataType'] : string;
  tableName: string;
};

type DialectColumnType<Dialect extends 'mysql' | 'pg' | 'sqlite'> =
  Dialect extends 'mysql'
    ?
        | 'MySqlVarChar'
        | 'MySqlText'
        | 'MySqlBoolean'
        | 'MySqlTimestamp'
        | 'MySqlInt'
        | 'MySqlJSON'
    : Dialect extends 'pg'
      ?
          | 'PgVarchar'
          | 'PgText'
          | 'PgBoolean'
          | 'PgTimestamp'
          | 'PgInteger'
          | 'PgUUID'
      : 'SQLiteText' | 'SQLiteBoolean' | 'SQLiteTimestamp' | 'SQLiteInteger';

type DialectColumn<Dialect extends 'mysql' | 'pg' | 'sqlite'> =
  Dialect extends 'mysql'
    ? MySqlColumn<any>
    : Dialect extends 'pg'
      ? PgColumn<any>
      : SQLiteColumn<any>;

export type CreateColumnConfig<
  Dialect extends 'mysql' | 'pg' | 'sqlite',
  T extends {
    data: string | number | boolean | Date | any;
    dataType: 'string' | 'number' | 'boolean' | 'date' | 'json';
    notNull: boolean;
    isPrimaryKey?: boolean;
  },
> = DialectColumn<Dialect> &
  BaseColumnConfig<T> & {
    columnType: DialectColumnType<Dialect>;
  };

export type TableConfig<T extends Record<string, any>> = {
  name: string;
  columns: T;
  schema: string | undefined;
};

export type CreateTableConfig<
  Dialect extends 'mysql' | 'pg' | 'sqlite',
  T extends Record<string, any>,
> = TableConfig<T> & {
  dialect: Dialect;
};

export function createDialectService<
  TMySqlDb extends AnyMySqlDatabase,
  TPgDb extends AnyPostgresDatabase,
  TSqliteDb extends AnySQLiteDatabase,
  TMySqlTable,
  TPgTable,
  TSqliteTable,
  TMySqlService,
  TPgService,
  TSqliteService,
>(
  db: TMySqlDb | TPgDb | TSqliteDb,
  table: TMySqlTable | TPgTable | TSqliteTable,
  impls: {
    mysql: new (db: TMySqlDb, table: TMySqlTable) => TMySqlService;
    pg: new (db: TPgDb, table: TPgTable) => TPgService;
    sqlite: new (db: TSqliteDb, table: TSqliteTable) => TSqliteService;
  }
): TMySqlService | TPgService | TSqliteService {
  if (is(db, MySqlDatabase)) {
    return new impls.mysql(db as TMySqlDb, table as TMySqlTable);
  }
  if (is(db, PgDatabase)) {
    return new impls.pg(db as TPgDb, table as TPgTable);
  }
  if (is(db, BaseSQLiteDatabase)) {
    return new impls.sqlite(db as TSqliteDb, table as TSqliteTable);
  }
  throw new Error('Unsupported dialect');
}
