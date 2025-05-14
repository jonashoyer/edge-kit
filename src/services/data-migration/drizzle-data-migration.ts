import { PgDatabase, PgTableWithColumns } from "drizzle-orm/pg-core";
import { AnyMySqlDatabase, CreateColumnConfig, CreateTableConfig, DefaultSchema, SqlFlavorOptions } from "../../database/types";
import { MySqlDatabase, MySqlTableWithColumns } from "drizzle-orm/mysql-core";
import { BaseSQLiteDatabase, type SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import { genId } from "../../utils/id-generator";
import { is } from 'drizzle-orm';
import { AbstractLogger } from "../logging/abstract-logger";

export type DataMigrationTable<Dialect extends "mysql" | "pg" | "sqlite"> = CreateTableConfig<{
  id: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  name: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  startedAt: CreateColumnConfig<{
    data: Date
    dataType: "date"
    notNull: true
  }, Dialect>
  completedAt: CreateColumnConfig<{
    data: Date
    dataType: "date"
    notNull: boolean
  }, Dialect>
  error: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: boolean
  }, Dialect>
  meta: CreateColumnConfig<{ // TODO: Add json type
    data: string
    dataType: "string"
    notNull: boolean
  }, Dialect>
}, Dialect>

export type MySqlDataMigrationTable = MySqlTableWithColumns<DataMigrationTable<"mysql">>;
export type PostgresDataMigrationTable = PgTableWithColumns<DataMigrationTable<"pg">>;
export type SQLiteDataMigrationTable = SQLiteTableWithColumns<DataMigrationTable<"sqlite">>;


export interface DataMigrationScript {
  name: string;
  description?: string;
  fn: () => Promise<void>;
}

export interface DrizzleDataMigrationServiceOptions<SqlFlavor extends SqlFlavorOptions> {
  db: SqlFlavor;
  table: DefaultSchema<
    SqlFlavor,
    { dm: MySqlDataMigrationTable },
    { dm: PostgresDataMigrationTable },
    { dm: SQLiteDataMigrationTable }
  >['dm'];
  scripts: DataMigrationScript[];
  logger?: AbstractLogger;
}

export class DrizzleDataMigrationService<SqlFlavor extends SqlFlavorOptions> {

  // Force a flavor for semi type safety
  private _db: SqlFlavor;
  private _table: DefaultSchema<
    SqlFlavor,
    { dm: MySqlDataMigrationTable },
    { dm: PostgresDataMigrationTable },
    { dm: SQLiteDataMigrationTable }
  >['dm'];
  private _scripts: DataMigrationScript[];
  private _logger: AbstractLogger | undefined;

  constructor(
    options: DrizzleDataMigrationServiceOptions<SqlFlavor>
  ) {
    this._db = options.db;
    this._table = options.table
    this._scripts = options.scripts;
    this._logger = options.logger;
  }

  private async insert(migration: DataMigrationScript, data: { startedAt: Date, completedAt: Date | null, error: string | null, meta: Record<string, unknown> }, set: { startedAt?: Date, completedAt?: Date, error?: string | null, meta?: Record<string, unknown> }) {
    if (is(this._db, MySqlDatabase)) {
      await this._db
        .insert(this._table as MySqlDataMigrationTable)
        .values({
          id: genId(),
          name: migration.name,
          ...data,
        })
        .onDuplicateKeyUpdate({
          set,
        })
    } else if (is(this._db, PgDatabase)) {
      const table = this._table as PostgresDataMigrationTable;
      await this._db
        .insert(table)
        .values({
          id: genId(),
          name: migration.name,
          ...data,

        })
        .onConflictDoUpdate({
          target: [table.name],
          set,
        })
    } else if (is(this._db, BaseSQLiteDatabase)) {
      const table = this._table as SQLiteDataMigrationTable;
      await this._db
        .insert(table)
        .values({
          id: genId(),
          name: migration.name,
          ...data,
        })
        .onConflictDoUpdate({
          target: [table.name],
          set,
        })
    }
  }

  async migrate() {
    const existingMigrations = await (this._db as AnyMySqlDatabase).select().from(this._table as MySqlDataMigrationTable);

    for (const migration of this._scripts) {
      const existingMigration = existingMigrations.find(m => m.name === migration.name);
      if (existingMigration) {
        continue;
      }

      let error: Error | null = null;
      const startedAt = new Date();

      try {
        this._logger?.info(`Starting migration: ${migration.name}`);
        const script = this._scripts.find(e => e.name == migration.name);
        if (!script) throw new Error(`Migration function not found: ${migration.name}`);

        await this.insert(migration, { startedAt, completedAt: null, error: null, meta: {} }, { startedAt });

        await script.fn();
        this._logger?.info(`Migration completed: ${migration.name} ${Date.now() - startedAt.getTime()}ms`);

      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        this._logger?.error(`Migration failed: ${migration.name} ${Date.now() - startedAt.getTime()}ms`, { error: e });
      } finally {

        const errorMessage = error ? [error.message, error.stack].filter(Boolean).join('\n\n') : null;

        const date = new Date();
        await this.insert(migration, { startedAt, completedAt: date, error: errorMessage, meta: {} }, { completedAt: date, error: errorMessage });
      }
    }
  }
}


// DRIZZLE DATA MIGRATION SCHEMA

// export const dataMigrations = mysqlTable('data_migration', {
//   id: varchar('id', { length: 20 }).notNull().primaryKey().$default(genId),
//   createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).notNull().defaultNow(),
//   updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 }).notNull().$onUpdate(() => new Date()),

//   name: varchar('name', { length: 255 }).unique().notNull(),

//   startedAt: timestamp('started_at', { mode: 'date', fsp: 3 }).notNull(),
//   completedAt: timestamp('completed_at', { mode: 'date', fsp: 3 }),

//   error: text('error'),
//   meta: json('meta').$type<Record<string, unknown>>(),
// });



// export const dataMigrationScripts = [
//   {
//     name: "toc-migration",
//     description: "Add table of contents to documents",
//     fn: tocMigrationFunction,
//   }, {
//     name: "backdate-first-login-at",
//     description: "Backdate first login at for all users",
//     fn: backdateFirstLoginAtFunction,
//   }
// ] as const;