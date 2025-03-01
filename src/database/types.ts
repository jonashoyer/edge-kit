import { GeneratedColumnConfig } from "drizzle-orm";
import { MySqlColumn } from "drizzle-orm/mysql-core";
import { PgColumn } from "drizzle-orm/pg-core";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { MySqlDatabase, MySqlQueryResultHKT, MySqlTableWithColumns, PreparedQueryHKTBase } from "drizzle-orm/mysql-core"
import { PgDatabase, PgQueryResultHKT, PgTableWithColumns } from "drizzle-orm/pg-core"
import { BaseSQLiteDatabase, SQLiteTableWithColumns } from "drizzle-orm/sqlite-core"

export type AnyPostgresDatabase = PgDatabase<PgQueryResultHKT, any>
export type AnyMySqlDatabase = MySqlDatabase<
  MySqlQueryResultHKT,
  PreparedQueryHKTBase,
  any
>
export type AnySQLiteDatabase = BaseSQLiteDatabase<"sync" | "async", any, any>

export type SqlFlavorOptions =
  | AnyPostgresDatabase
  | AnyMySqlDatabase
  | AnySQLiteDatabase

export type DefaultSchema<Flavor extends SqlFlavorOptions, TMySqlSchema extends Record<TKeys, MySqlTableWithColumns<any>>, TPostgresSchema extends Record<TKeys, PgTableWithColumns<any>>, TSQLiteSchema extends Record<TKeys, SQLiteTableWithColumns<any>>, TKeys extends string = string> =
  Flavor extends AnyMySqlDatabase
  ? TMySqlSchema
  : Flavor extends AnyPostgresDatabase
  ? TPostgresSchema
  : Flavor extends AnySQLiteDatabase
  ? TSQLiteSchema
  : never



type BaseColumnConfig<T> = {
  name: string
  isAutoincrement: boolean
  isPrimaryKey: T extends { isPrimaryKey: true } ? true : false
  hasRuntimeDefault: boolean
  generated: GeneratedColumnConfig<T extends { data: any } ? T["data"] : never> | undefined
  data: T extends { data: any } ? T["data"] : never
  driverParam: string | number | boolean
  notNull: T extends { notNull: boolean } ? T["notNull"] : boolean
  hasDefault: boolean
  enumValues: any
  dataType: T extends { dataType: string } ? T["dataType"] : string
  tableName: string
}

type DialectColumnType<Dialect extends "mysql" | "pg" | "sqlite"> = {
  mysql: "MySqlVarChar" | "MySqlText" | "MySqlBoolean" | "MySqlTimestamp" | "MySqlInt"
  pg: "PgVarchar" | "PgText" | "PgBoolean" | "PgTimestamp" | "PgInteger" | "PgUUID"
  sqlite: "SQLiteText" | "SQLiteBoolean" | "SQLiteTimestamp" | "SQLiteInteger"
}[Dialect]

type DialectColumn<Dialect extends "mysql" | "pg" | "sqlite"> = {
  mysql: MySqlColumn<any>
  pg: PgColumn<any>
  sqlite: SQLiteColumn<any>
}[Dialect]

export type CreateColumnConfig<
  T extends {
    data: string | number | boolean | Date
    dataType: "string" | "number" | "boolean" | "date"
    notNull: boolean
    isPrimaryKey?: boolean
  },
  Dialect extends "mysql" | "pg" | "sqlite"
> = DialectColumn<Dialect> & BaseColumnConfig<T> & {
  columnType: DialectColumnType<Dialect>
}

export type TableConfig<T extends Record<string, any>> = {
  name: string
  columns: T
  schema: string | undefined
}

export type CreateTableConfig<
  T extends Record<string, any>,
  Dialect extends "mysql" | "pg" | "sqlite"
> = TableConfig<T> & {
  dialect: Dialect
} 