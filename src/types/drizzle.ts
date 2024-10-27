import type {
  MySqlQueryResultHKT,
  PreparedQueryHKTBase,
} from "drizzle-orm/mysql-core"
import { MySqlDatabase } from "drizzle-orm/mysql-core"
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core"
import type { MySqlTableWithColumns } from "drizzle-orm/mysql-core"
import type { PgTableWithColumns } from "drizzle-orm/pg-core"

type AnyPostgresDatabase = PgDatabase<PgQueryResultHKT, any>
type AnyMySqlDatabase = MySqlDatabase<
  MySqlQueryResultHKT,
  PreparedQueryHKTBase,
  any
>
type AnySQLiteDatabase = BaseSQLiteDatabase<"sync" | "async", any, any>

export type SqlFlavorOptions =
  | AnyPostgresDatabase
  | AnyMySqlDatabase
  | AnySQLiteDatabase

export type DefaultSchema<Flavor extends SqlFlavorOptions, TKeys extends string, TMySqlSchema extends Record<TKeys, SQLiteTableWithColumns<any>>, TPostgresSchema extends Record<TKeys, PgTableWithColumns<any>>, TSQLiteSchema extends Record<TKeys, MySqlTableWithColumns<any>>> =
  Flavor extends AnyMySqlDatabase
  ? TMySqlSchema
  : Flavor extends AnyPostgresDatabase
  ? TPostgresSchema
  : Flavor extends AnySQLiteDatabase
  ? TSQLiteSchema
  : never
