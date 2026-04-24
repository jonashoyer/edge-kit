import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  is,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
import {
  MySqlDatabase,
  type MySqlTableWithColumns,
  json as mysqlJson,
  mysqlTable,
  text as mysqlText,
  timestamp as mysqlTimestamp,
  varchar as mysqlVarchar,
} from 'drizzle-orm/mysql-core';
import {
  PgDatabase,
  type PgTableWithColumns,
  json as pgJson,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
} from 'drizzle-orm/pg-core';
import {
  BaseSQLiteDatabase,
  integer,
  type SQLiteTableWithColumns,
  sqliteTable,
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
  AbstractStorageAssetService,
  decodeStorageAssetCursor,
  encodeStorageAssetCursor,
  InvalidStorageAssetCursorError,
  type ListOrphanedStorageAssetRootsOptions,
  StorageAssetFamilyConsistencyError,
  type StorageAssetListOrder,
  type StorageAssetListPageOptions,
  type StorageAssetListPageResult,
  type StorageAssetRecord,
  type UpsertStorageAssetInput,
} from './abstract-storage-asset';

const DEFAULT_TABLE_NAME = 'storage_asset';
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 250;

const EMPTY_META = {};

const assertNonEmptyString = (value: string, label: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Storage asset ${label} must not be empty`);
  }

  return normalized;
};

const normalizeTags = (tags: string[] | undefined): string[] => {
  if (!tags) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();

    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const normalizeMetaObject = <TMeta extends object>(
  meta: TMeta | undefined
): TMeta => {
  return (meta ?? EMPTY_META) as TMeta;
};

const normalizeParentAssetId = (
  parentAssetId: string | null | undefined
): string | null => {
  if (parentAssetId === undefined || parentAssetId === null) {
    return null;
  }

  return assertNonEmptyString(parentAssetId, 'parentAssetId');
};

const normalizeOrder = (
  order: StorageAssetListOrder | undefined
): StorageAssetListOrder => {
  return order ?? 'desc';
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.floor(limit)));
};

type StorageAssetTableDefinition<
  Dialect extends 'mysql' | 'pg' | 'sqlite',
  TMeta extends object = Record<string, unknown>,
> = CreateTableConfig<
  Dialect,
  {
    id: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: true;
        isPrimaryKey: true;
      }
    >;
    objectKey: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: true;
      }
    >;
    mimeType: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: true;
      }
    >;
    source: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: true;
      }
    >;
    parentAssetId: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: false;
      }
    >;
    orphanedAt: CreateColumnConfig<
      Dialect,
      {
        data: Date;
        dataType: 'date';
        notNull: false;
      }
    >;
    tags: CreateColumnConfig<
      Dialect,
      {
        data: string[];
        dataType: 'json';
        notNull: true;
      }
    >;
    meta: CreateColumnConfig<
      Dialect,
      {
        data: TMeta;
        dataType: 'json';
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

export type MySqlStorageAssetTable<
  TMeta extends object = Record<string, unknown>,
> = MySqlTableWithColumns<StorageAssetTableDefinition<'mysql', TMeta>>;

export type PostgresStorageAssetTable<
  TMeta extends object = Record<string, unknown>,
> = PgTableWithColumns<StorageAssetTableDefinition<'pg', TMeta>>;

export type SQLiteStorageAssetTable<
  TMeta extends object = Record<string, unknown>,
> = SQLiteTableWithColumns<StorageAssetTableDefinition<'sqlite', TMeta>>;

export const createMySqlStorageAssetTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): MySqlStorageAssetTable<TMeta> => {
  return mysqlTable(name, {
    id: mysqlVarchar('id', { length: 191 }).notNull().primaryKey(),
    objectKey: mysqlText('object_key').notNull(),
    mimeType: mysqlVarchar('mime_type', { length: 255 }).notNull(),
    source: mysqlVarchar('source', { length: 255 }).notNull(),
    parentAssetId: mysqlVarchar('parent_asset_id', { length: 191 }),
    orphanedAt: mysqlTimestamp('orphaned_at', { mode: 'date', fsp: 3 }),
    tags: mysqlJson('tags').$type<string[]>().notNull(),
    meta: mysqlJson('meta').$type<TMeta>().notNull(),
    createdAt: mysqlTimestamp('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: mysqlTimestamp('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  }) as MySqlStorageAssetTable<TMeta>;
};

export const createPostgresStorageAssetTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): PostgresStorageAssetTable<TMeta> => {
  return pgTable(name, {
    id: pgText('id').notNull().primaryKey(),
    objectKey: pgText('object_key').notNull(),
    mimeType: pgText('mime_type').notNull(),
    source: pgText('source').notNull(),
    parentAssetId: pgText('parent_asset_id'),
    orphanedAt: pgTimestamp('orphaned_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    tags: pgJson('tags').$type<string[]>().notNull(),
    meta: pgJson('meta').$type<TMeta>().notNull(),
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
  }) as PostgresStorageAssetTable<TMeta>;
};

export const createSqliteStorageAssetTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): SQLiteStorageAssetTable<TMeta> => {
  return sqliteTable(name, {
    id: text('id').notNull().primaryKey(),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type').notNull(),
    source: text('source').notNull(),
    parentAssetId: text('parent_asset_id'),
    orphanedAt: integer('orphaned_at', { mode: 'timestamp_ms' }),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    meta: text('meta', { mode: 'json' }).$type<TMeta>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  }) as SQLiteStorageAssetTable<TMeta>;
};

type StorageAssetRow<TMeta extends object> = {
  id: string;
  objectKey: string;
  mimeType: string;
  source: string;
  parentAssetId: string | null;
  orphanedAt: Date | null;
  tags: string[];
  meta: TMeta;
  createdAt: Date;
  updatedAt: Date;
};

type AnyStorageAssetTable<TMeta extends object> =
  | MySqlStorageAssetTable<TMeta>
  | PostgresStorageAssetTable<TMeta>
  | SQLiteStorageAssetTable<TMeta>;

class BaseDrizzleStorageAssetService<
  TDb extends AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  TTable extends AnyStorageAssetTable<TMeta>,
  TMeta extends object = Record<string, unknown>,
> extends AbstractStorageAssetService<TMeta> {
  protected readonly db: TDb;
  protected readonly table: TTable;
  private readonly internal: {
    db: AnyMySqlDatabase;
    table: MySqlStorageAssetTable<TMeta>;
  };

  constructor(db: TDb, table: TTable) {
    super();
    this.db = db;
    this.table = table;
    this.internal = {
      db: db as AnyMySqlDatabase,
      table: table as MySqlStorageAssetTable<TMeta>,
    };
  }

  private selectShape() {
    const { table } = this.internal;

    return {
      id: table.id,
      objectKey: table.objectKey,
      mimeType: table.mimeType,
      source: table.source,
      parentAssetId: table.parentAssetId,
      orphanedAt: table.orphanedAt,
      tags: table.tags,
      meta: table.meta,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  }

  private toRecord(row: StorageAssetRow<TMeta>): StorageAssetRecord<TMeta> {
    return {
      ...row,
      parentAssetId: row.parentAssetId ?? null,
      orphanedAt: row.orphanedAt ?? null,
      tags: row.tags ?? [],
      meta: normalizeMetaObject(row.meta),
    };
  }

  private normalizeRow(
    input: UpsertStorageAssetInput<TMeta>,
    existing: StorageAssetRecord<TMeta> | null
  ): StorageAssetRow<TMeta> {
    const createdAt = input.createdAt ?? existing?.createdAt ?? new Date();
    const updatedAt = input.updatedAt ?? new Date();

    return {
      id: assertNonEmptyString(input.id, 'id'),
      objectKey: assertNonEmptyString(input.objectKey, 'objectKey'),
      mimeType: assertNonEmptyString(input.mimeType, 'mimeType'),
      source: assertNonEmptyString(input.source, 'source'),
      parentAssetId: normalizeParentAssetId(input.parentAssetId),
      orphanedAt: input.orphanedAt ?? existing?.orphanedAt ?? null,
      tags: normalizeTags(input.tags),
      meta: normalizeMetaObject(input.meta ?? existing?.meta),
      createdAt,
      updatedAt,
    };
  }

  private buildCursorCondition(
    order: StorageAssetListOrder,
    cursor: string
  ): SQL {
    const decoded = decodeStorageAssetCursor(cursor);

    if (decoded.order !== order) {
      throw new InvalidStorageAssetCursorError();
    }

    const { table } = this.internal;
    const createdAt = new Date(decoded.createdAt);
    const createdAtComparison =
      order === 'asc'
        ? gt(table.createdAt, createdAt)
        : lt(table.createdAt, createdAt);
    const tieBreaker =
      order === 'asc' ? gt(table.id, decoded.id) : lt(table.id, decoded.id);
    const sameTimestampCondition = and(
      eq(table.createdAt, createdAt),
      tieBreaker
    );

    if (!sameTimestampCondition) {
      throw new Error('Failed to build storage asset cursor condition');
    }

    const cursorCondition = or(createdAtComparison, sameTimestampCondition);

    if (!cursorCondition) {
      throw new Error('Failed to build storage asset cursor predicate');
    }

    return cursorCondition;
  }

  private buildListConditions(
    options: StorageAssetListPageOptions,
    order: StorageAssetListOrder
  ): SQL[] {
    const { table } = this.internal;
    const conditions: SQL[] = [];

    if (options.source !== undefined) {
      conditions.push(
        eq(table.source, assertNonEmptyString(options.source, 'source'))
      );
    }

    if (options.parentAssetId !== undefined) {
      if (options.parentAssetId === null) {
        conditions.push(isNull(table.parentAssetId));
      } else {
        conditions.push(
          eq(
            table.parentAssetId,
            assertNonEmptyString(options.parentAssetId, 'parentAssetId')
          )
        );
      }
    }

    if (options.cursor) {
      conditions.push(this.buildCursorCondition(order, options.cursor));
    }

    return conditions;
  }

  private combineConditions(conditions: SQL[]): SQL | undefined {
    if (conditions.length === 1) {
      return conditions[0];
    }

    if (conditions.length > 1) {
      return and(...conditions);
    }

    return;
  }

  protected async persist(
    row: StorageAssetRow<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    throw new Error('Not implemented');
  }

  override async get(id: string): Promise<StorageAssetRecord<TMeta> | null> {
    const normalizedId = assertNonEmptyString(id, 'id');
    const { db, table } = this.internal;
    const rows = await db
      .select(this.selectShape())
      .from(table)
      .where(eq(table.id, normalizedId))
      .limit(1)
      .execute();

    const row = rows[0] as StorageAssetRow<TMeta> | undefined;

    return row ? this.toRecord(row) : null;
  }

  override async getMany(ids: string[]): Promise<StorageAssetRecord<TMeta>[]> {
    if (ids.length === 0) {
      return [];
    }

    const normalizedIds = ids.map((id) => assertNonEmptyString(id, 'id'));
    const { db, table } = this.internal;
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(inArray(table.id, normalizedIds))
      .execute()) as StorageAssetRow<TMeta>[];

    const recordsById = new Map(
      rows.map((row) => {
        const record = this.toRecord(row);
        return [record.id, record] as const;
      })
    );

    return normalizedIds.flatMap((id) => {
      const record = recordsById.get(id);
      return record ? [record] : [];
    });
  }

  override async listByParentIds(
    parentAssetIds: string[]
  ): Promise<StorageAssetRecord<TMeta>[]> {
    if (parentAssetIds.length === 0) {
      return [];
    }

    const normalizedIds = parentAssetIds.map((id) =>
      assertNonEmptyString(id, 'parentAssetId')
    );
    const { db, table } = this.internal;
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(inArray(table.parentAssetId, normalizedIds))
      .orderBy(asc(table.parentAssetId), asc(table.createdAt), asc(table.id))
      .execute()) as StorageAssetRow<TMeta>[];

    return rows.map((row) => this.toRecord(row));
  }

  override async listPage(
    options: StorageAssetListPageOptions = {}
  ): Promise<StorageAssetListPageResult<TMeta>> {
    const limit = clampLimit(options.limit);
    const order = normalizeOrder(options.order);
    const { db, table } = this.internal;
    const conditions = this.buildListConditions(options, order);
    const where = this.combineConditions(conditions);
    const direction = order === 'asc' ? asc : desc;
    const query = db.select(this.selectShape()).from(table);
    const filtered = where ? query.where(where) : query;
    const rows = (await filtered
      .orderBy(direction(table.createdAt), direction(table.id))
      .limit(limit + 1)
      .execute()) as StorageAssetRow<TMeta>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => this.toRecord(row));
    const lastItem = pageRows.at(-1);

    return {
      items,
      ...(hasMore && lastItem
        ? { nextCursor: encodeStorageAssetCursor(lastItem, order) }
        : {}),
    };
  }

  override async upsert(
    input: UpsertStorageAssetInput<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    const existing = await this.get(input.id);
    const row = this.normalizeRow(input, existing);

    return await this.persist(row);
  }

  override async listOrphanedRoots(
    options: ListOrphanedStorageAssetRootsOptions = {}
  ): Promise<StorageAssetRecord<TMeta>[]> {
    const limit = clampLimit(options.limit);
    const { db, table } = this.internal;
    const conditions: SQL[] = [isNull(table.parentAssetId)];

    if (options.olderThan) {
      conditions.push(lte(table.orphanedAt, options.olderThan));
    } else {
      conditions.push(isNotNull(table.orphanedAt));
    }

    const where = this.combineConditions(conditions);
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(where)
      .orderBy(asc(table.orphanedAt), asc(table.id))
      .limit(limit)
      .execute()) as StorageAssetRow<TMeta>[];

    return rows.map((row) => this.toRecord(row));
  }

  override async setOrphanedAt(
    ids: string[],
    orphanedAt: Date | null
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const normalizedIds = ids.map((id) => assertNonEmptyString(id, 'id'));
    const { db, table } = this.internal;

    await db
      .update(table)
      .set({
        orphanedAt,
        updatedAt: new Date(),
      })
      .where(inArray(table.id, normalizedIds))
      .execute();
  }

  override async resolveRoot(
    assetId: string
  ): Promise<StorageAssetRecord<TMeta> | null> {
    const normalizedId = assertNonEmptyString(assetId, 'id');
    const visited = new Set<string>();
    let currentId: string | null = normalizedId;

    while (currentId) {
      if (visited.has(currentId)) {
        throw new StorageAssetFamilyConsistencyError(normalizedId);
      }

      visited.add(currentId);
      const asset = await this.get(currentId);

      if (!asset) {
        return null;
      }

      if (asset.parentAssetId === null) {
        return asset;
      }

      currentId = asset.parentAssetId;
    }

    throw new StorageAssetFamilyConsistencyError(normalizedId);
  }

  override async delete(id: string): Promise<void> {
    const normalizedId = assertNonEmptyString(id, 'id');
    const { db, table } = this.internal;

    await db.delete(table).where(eq(table.id, normalizedId)).execute();
  }
}

class MySqlDrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
> extends BaseDrizzleStorageAssetService<
  AnyMySqlDatabase,
  MySqlStorageAssetTable<TMeta>,
  TMeta
> {
  protected override async persist(
    row: StorageAssetRow<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    await this.db
      .insert(this.table)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          objectKey: row.objectKey,
          mimeType: row.mimeType,
          source: row.source,
          parentAssetId: row.parentAssetId,
          orphanedAt: row.orphanedAt,
          tags: row.tags,
          meta: row.meta,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .execute();

    return row;
  }
}

class PostgresDrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
> extends BaseDrizzleStorageAssetService<
  AnyPostgresDatabase,
  PostgresStorageAssetTable<TMeta>,
  TMeta
> {
  protected override async persist(
    row: StorageAssetRow<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: this.table.id,
        set: {
          objectKey: row.objectKey,
          mimeType: row.mimeType,
          source: row.source,
          parentAssetId: row.parentAssetId,
          orphanedAt: row.orphanedAt,
          tags: row.tags,
          meta: row.meta,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .execute();

    return row;
  }
}

class SqliteDrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
> extends BaseDrizzleStorageAssetService<
  AnySQLiteDatabase,
  SQLiteStorageAssetTable<TMeta>,
  TMeta
> {
  protected override async persist(
    row: StorageAssetRow<TMeta>
  ): Promise<StorageAssetRecord<TMeta>> {
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: this.table.id,
        set: {
          objectKey: row.objectKey,
          mimeType: row.mimeType,
          source: row.source,
          parentAssetId: row.parentAssetId,
          orphanedAt: row.orphanedAt,
          tags: row.tags,
          meta: row.meta,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .run();

    return row;
  }
}

export function DrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnyMySqlDatabase,
  table: MySqlStorageAssetTable<TMeta>
): AbstractStorageAssetService<TMeta>;
export function DrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnyPostgresDatabase,
  table: PostgresStorageAssetTable<TMeta>
): AbstractStorageAssetService<TMeta>;
export function DrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnySQLiteDatabase,
  table: SQLiteStorageAssetTable<TMeta>
): AbstractStorageAssetService<TMeta>;
export function DrizzleStorageAssetService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  table: AnyStorageAssetTable<TMeta>
): AbstractStorageAssetService<TMeta> {
  if (is(db, MySqlDatabase)) {
    return new MySqlDrizzleStorageAssetService(
      db,
      table as MySqlStorageAssetTable<TMeta>
    );
  }

  if (is(db, PgDatabase)) {
    return new PostgresDrizzleStorageAssetService(
      db,
      table as PostgresStorageAssetTable<TMeta>
    );
  }

  if (is(db, BaseSQLiteDatabase)) {
    return new SqliteDrizzleStorageAssetService(
      db,
      table as SQLiteStorageAssetTable<TMeta>
    );
  }

  throw new Error('Unsupported dialect');
}
