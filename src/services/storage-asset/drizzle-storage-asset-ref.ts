import { and, asc, eq, inArray, is, type SQL } from 'drizzle-orm';
import {
  MySqlDatabase,
  type MySqlTableWithColumns,
  index as mysqlIndex,
  mysqlTable,
  timestamp as mysqlTimestamp,
  uniqueIndex as mysqlUniqueIndex,
  varchar as mysqlVarchar,
} from 'drizzle-orm/mysql-core';
import {
  PgDatabase,
  type PgTableWithColumns,
  index as pgIndex,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  uniqueIndex as pgUniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  BaseSQLiteDatabase,
  integer,
  type SQLiteTableWithColumns,
  index as sqliteIndex,
  sqliteTable,
  uniqueIndex as sqliteUniqueIndex,
  text,
} from 'drizzle-orm/sqlite-core';

import type {
  AnyMySqlDatabase,
  AnyPostgresDatabase,
  AnySQLiteDatabase,
  CreateColumnConfig,
  CreateTableConfig,
} from '../../database/types';
import {
  AbstractStorageAssetRefService,
  type DeleteStorageAssetOwnerRefInput,
  type StorageAssetOwnerRef,
  type StorageAssetOwnerRefScope,
  type UpsertStorageAssetOwnerRefInput,
} from './abstract-storage-asset-ref';

const DEFAULT_TABLE_NAME = 'storage_asset_ref';
const EMPTY_TENANT_KEY = '';

const normalizeRequiredString = (value: string, label: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Storage asset ref ${label} must not be empty`);
  }

  return normalized;
};

const normalizeTenantId = (
  tenantId: string | null | undefined
): string | null => {
  if (tenantId === undefined || tenantId === null) {
    return null;
  }

  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : null;
};

const toTenantKey = (tenantId: string | null | undefined): string => {
  return normalizeTenantId(tenantId) ?? EMPTY_TENANT_KEY;
};

type StorageAssetRefTableDefinition<Dialect extends 'mysql' | 'pg' | 'sqlite'> =
  CreateTableConfig<
    Dialect,
    {
      tenantId: CreateColumnConfig<
        Dialect,
        {
          data: string;
          dataType: 'string';
          notNull: false;
        }
      >;
      tenantKey: CreateColumnConfig<
        Dialect,
        {
          data: string;
          dataType: 'string';
          notNull: true;
        }
      >;
      assetId: CreateColumnConfig<
        Dialect,
        {
          data: string;
          dataType: 'string';
          notNull: true;
        }
      >;
      ownerType: CreateColumnConfig<
        Dialect,
        {
          data: string;
          dataType: 'string';
          notNull: true;
        }
      >;
      ownerId: CreateColumnConfig<
        Dialect,
        {
          data: string;
          dataType: 'string';
          notNull: true;
        }
      >;
      createdAt: CreateColumnConfig<
        Dialect,
        {
          data: Date;
          dataType: 'date';
          notNull: true;
        }
      >;
      updatedAt: CreateColumnConfig<
        Dialect,
        {
          data: Date;
          dataType: 'date';
          notNull: true;
        }
      >;
    }
  >;

export type MySqlStorageAssetRefTable = MySqlTableWithColumns<
  StorageAssetRefTableDefinition<'mysql'>
>;
export type PostgresStorageAssetRefTable = PgTableWithColumns<
  StorageAssetRefTableDefinition<'pg'>
>;
export type SQLiteStorageAssetRefTable = SQLiteTableWithColumns<
  StorageAssetRefTableDefinition<'sqlite'>
>;

export const createMySqlStorageAssetRefTable = (
  name = DEFAULT_TABLE_NAME
): MySqlStorageAssetRefTable => {
  return mysqlTable(
    name,
    {
      tenantId: mysqlVarchar('tenant_id', { length: 191 }),
      tenantKey: mysqlVarchar('tenant_key', { length: 191 }).notNull(),
      assetId: mysqlVarchar('asset_id', { length: 191 }).notNull(),
      ownerType: mysqlVarchar('owner_type', { length: 191 }).notNull(),
      ownerId: mysqlVarchar('owner_id', { length: 191 }).notNull(),
      createdAt: mysqlTimestamp('created_at', {
        mode: 'date',
        fsp: 3,
      }).notNull(),
      updatedAt: mysqlTimestamp('updated_at', {
        mode: 'date',
        fsp: 3,
      }).notNull(),
    },
    (table) => ({
      ownerAssetUnique: mysqlUniqueIndex(`${name}_owner_asset_unique`).on(
        table.tenantKey,
        table.ownerType,
        table.ownerId,
        table.assetId
      ),
      assetIdIndex: mysqlIndex(`${name}_asset_lookup_idx`).on(
        table.tenantKey,
        table.assetId
      ),
    })
  ) as MySqlStorageAssetRefTable;
};

export const createPostgresStorageAssetRefTable = (
  name = DEFAULT_TABLE_NAME
): PostgresStorageAssetRefTable => {
  return pgTable(
    name,
    {
      tenantId: pgText('tenant_id'),
      tenantKey: pgText('tenant_key').notNull(),
      assetId: pgText('asset_id').notNull(),
      ownerType: pgText('owner_type').notNull(),
      ownerId: pgText('owner_id').notNull(),
      createdAt: pgTimestamp('created_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }).notNull(),
      updatedAt: pgTimestamp('updated_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }).notNull(),
    },
    (table) => ({
      ownerAssetUnique: pgUniqueIndex(`${name}_owner_asset_unique`).on(
        table.tenantKey,
        table.ownerType,
        table.ownerId,
        table.assetId
      ),
      assetIdIndex: pgIndex(`${name}_asset_lookup_idx`).on(
        table.tenantKey,
        table.assetId
      ),
    })
  ) as PostgresStorageAssetRefTable;
};

export const createSqliteStorageAssetRefTable = (
  name = DEFAULT_TABLE_NAME
): SQLiteStorageAssetRefTable => {
  return sqliteTable(
    name,
    {
      tenantId: text('tenant_id'),
      tenantKey: text('tenant_key').notNull(),
      assetId: text('asset_id').notNull(),
      ownerType: text('owner_type').notNull(),
      ownerId: text('owner_id').notNull(),
      createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
      updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (table) => ({
      ownerAssetUnique: sqliteUniqueIndex(`${name}_owner_asset_unique`).on(
        table.tenantKey,
        table.ownerType,
        table.ownerId,
        table.assetId
      ),
      assetIdIndex: sqliteIndex(`${name}_asset_lookup_idx`).on(
        table.tenantKey,
        table.assetId
      ),
    })
  ) as SQLiteStorageAssetRefTable;
};

type StorageAssetRefRow = {
  tenantId: string | null;
  tenantKey: string;
  assetId: string;
  ownerType: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

type AnyStorageAssetRefTable =
  | MySqlStorageAssetRefTable
  | PostgresStorageAssetRefTable
  | SQLiteStorageAssetRefTable;

class BaseDrizzleStorageAssetRefService<
  TDb extends AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  TTable extends AnyStorageAssetRefTable,
> extends AbstractStorageAssetRefService {
  protected readonly db: TDb;
  protected readonly table: TTable;
  private readonly internal: {
    db: AnyMySqlDatabase;
    table: MySqlStorageAssetRefTable;
  };

  constructor(db: TDb, table: TTable) {
    super();
    this.db = db;
    this.table = table;
    this.internal = {
      db: db as AnyMySqlDatabase,
      table: table as MySqlStorageAssetRefTable,
    };
  }

  private selectShape() {
    const { table } = this.internal;

    return {
      tenantId: table.tenantId,
      tenantKey: table.tenantKey,
      assetId: table.assetId,
      ownerType: table.ownerType,
      ownerId: table.ownerId,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  }

  private toRecord(row: StorageAssetRefRow): StorageAssetOwnerRef {
    return {
      assetId: row.assetId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      tenantId: normalizeTenantId(row.tenantId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private normalizeRow(
    input: UpsertStorageAssetOwnerRefInput,
    existing: StorageAssetOwnerRef | null
  ): StorageAssetRefRow {
    const tenantId = normalizeTenantId(input.tenantId);

    return {
      tenantId,
      tenantKey: toTenantKey(tenantId),
      assetId: normalizeRequiredString(input.assetId, 'assetId'),
      ownerType: normalizeRequiredString(input.ownerType, 'ownerType'),
      ownerId: normalizeRequiredString(input.ownerId, 'ownerId'),
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
    };
  }

  private buildOwnerWhere(scope: StorageAssetOwnerRefScope): SQL {
    const { table } = this.internal;
    const tenantId = normalizeTenantId(scope.tenantId);
    const tenantCondition = eq(table.tenantKey, toTenantKey(tenantId));
    const ownerTypeCondition = eq(
      table.ownerType,
      normalizeRequiredString(scope.ownerType, 'ownerType')
    );
    const ownerIdCondition = eq(
      table.ownerId,
      normalizeRequiredString(scope.ownerId, 'ownerId')
    );
    const predicate = and(
      tenantCondition,
      ownerTypeCondition,
      ownerIdCondition
    );

    if (!predicate) {
      throw new Error('Failed to build storage asset ref owner predicate');
    }

    return predicate;
  }

  protected async findExisting(
    input: DeleteStorageAssetOwnerRefInput
  ): Promise<StorageAssetOwnerRef | null> {
    const { db, table } = this.internal;
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(
        and(
          this.buildOwnerWhere(input),
          eq(table.assetId, normalizeRequiredString(input.assetId, 'assetId'))
        )
      )
      .limit(1)
      .execute()) as StorageAssetRefRow[];
    const row = rows[0];

    return row ? this.toRecord(row) : null;
  }

  override async listByOwner(
    scope: StorageAssetOwnerRefScope
  ): Promise<StorageAssetOwnerRef[]> {
    const { db, table } = this.internal;
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(this.buildOwnerWhere(scope))
      .orderBy(asc(table.createdAt), asc(table.assetId))
      .execute()) as StorageAssetRefRow[];

    return rows.map((row) => this.toRecord(row));
  }

  override async listByAssetIds(
    assetIds: string[]
  ): Promise<StorageAssetOwnerRef[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const normalizedIds = assetIds.map((assetId) =>
      normalizeRequiredString(assetId, 'assetId')
    );
    const { db, table } = this.internal;
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(inArray(table.assetId, normalizedIds))
      .orderBy(asc(table.assetId), asc(table.createdAt))
      .execute()) as StorageAssetRefRow[];

    return rows.map((row) => this.toRecord(row));
  }

  protected async persist(
    row: StorageAssetRefRow
  ): Promise<StorageAssetOwnerRef> {
    throw new Error('Not implemented');
  }

  override async upsert(
    input: UpsertStorageAssetOwnerRefInput
  ): Promise<StorageAssetOwnerRef> {
    const existing = await this.findExisting(input);
    const row = this.normalizeRow(input, existing);

    return await this.persist(row);
  }

  override async delete(input: DeleteStorageAssetOwnerRefInput): Promise<void> {
    const { db, table } = this.internal;

    await db
      .delete(table)
      .where(
        and(
          this.buildOwnerWhere(input),
          eq(table.assetId, normalizeRequiredString(input.assetId, 'assetId'))
        )
      )
      .execute();
  }

  override async deleteByAssetIds(assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    const normalizedIds = assetIds.map((assetId) =>
      normalizeRequiredString(assetId, 'assetId')
    );
    const { db, table } = this.internal;

    await db
      .delete(table)
      .where(inArray(table.assetId, normalizedIds))
      .execute();
  }
}

class MySqlDrizzleStorageAssetRefService extends BaseDrizzleStorageAssetRefService<
  AnyMySqlDatabase,
  MySqlStorageAssetRefTable
> {
  protected override async persist(
    row: StorageAssetRefRow
  ): Promise<StorageAssetOwnerRef> {
    await this.db
      .insert(this.table)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          tenantId: row.tenantId,
          tenantKey: row.tenantKey,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .execute();

    return {
      assetId: row.assetId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

class PostgresDrizzleStorageAssetRefService extends BaseDrizzleStorageAssetRefService<
  AnyPostgresDatabase,
  PostgresStorageAssetRefTable
> {
  protected override async persist(
    row: StorageAssetRefRow
  ): Promise<StorageAssetOwnerRef> {
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: [
          this.table.tenantKey,
          this.table.ownerType,
          this.table.ownerId,
          this.table.assetId,
        ],
        set: {
          tenantId: row.tenantId,
          tenantKey: row.tenantKey,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .execute();

    return {
      assetId: row.assetId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

class SqliteDrizzleStorageAssetRefService extends BaseDrizzleStorageAssetRefService<
  AnySQLiteDatabase,
  SQLiteStorageAssetRefTable
> {
  protected override async persist(
    row: StorageAssetRefRow
  ): Promise<StorageAssetOwnerRef> {
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: [
          this.table.tenantKey,
          this.table.ownerType,
          this.table.ownerId,
          this.table.assetId,
        ],
        set: {
          tenantId: row.tenantId,
          tenantKey: row.tenantKey,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .run();

    return {
      assetId: row.assetId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export function DrizzleStorageAssetRefService(
  db: AnyMySqlDatabase,
  table: MySqlStorageAssetRefTable
): AbstractStorageAssetRefService;
export function DrizzleStorageAssetRefService(
  db: AnyPostgresDatabase,
  table: PostgresStorageAssetRefTable
): AbstractStorageAssetRefService;
export function DrizzleStorageAssetRefService(
  db: AnySQLiteDatabase,
  table: SQLiteStorageAssetRefTable
): AbstractStorageAssetRefService;
export function DrizzleStorageAssetRefService(
  db: AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  table: AnyStorageAssetRefTable
): AbstractStorageAssetRefService {
  if (is(db, MySqlDatabase)) {
    return new MySqlDrizzleStorageAssetRefService(
      db,
      table as MySqlStorageAssetRefTable
    );
  }

  if (is(db, PgDatabase)) {
    return new PostgresDrizzleStorageAssetRefService(
      db,
      table as PostgresStorageAssetRefTable
    );
  }

  if (is(db, BaseSQLiteDatabase)) {
    return new SqliteDrizzleStorageAssetRefService(
      db,
      table as SQLiteStorageAssetRefTable
    );
  }

  throw new Error('Unsupported dialect');
}
