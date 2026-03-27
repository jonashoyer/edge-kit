import { and, asc, eq, inArray, is, isNull, lte, type SQL } from 'drizzle-orm';
import {
  MySqlDatabase,
  int as mysqlInt,
  index as mysqlIndex,
  json as mysqlJson,
  type MySqlTableWithColumns,
  mysqlTable,
  timestamp as mysqlTimestamp,
  varchar as mysqlVarchar,
} from 'drizzle-orm/mysql-core';
import {
  PgDatabase,
  index as pgIndex,
  integer as pgInteger,
  json as pgJson,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  type PgTableWithColumns,
} from 'drizzle-orm/pg-core';
import {
  BaseSQLiteDatabase,
  index as sqliteIndex,
  integer,
  sqliteTable,
  text,
  type SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';

import type {
  AnyMySqlDatabase,
  AnyPostgresDatabase,
  AnySQLiteDatabase,
  CreateColumnConfig,
  CreateTableConfig,
} from '../../database/types';
import {
  AbstractStorageUploadLedgerService,
  type ListExpiredStorageUploadsOptions,
  type StorageUploadLedgerRecord,
  type StorageUploadStatus,
  type UpsertStorageUploadLedgerInput,
} from './abstract-storage-upload-ledger';

const DEFAULT_TABLE_NAME = 'storage_upload_ledger';
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 250;

const EMPTY_META = {};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.floor(limit)));
};

const normalizeRequiredString = (value: string, label: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Storage upload ${label} must not be empty`);
  }

  return normalized;
};

const normalizeTenantId = (tenantId: string | null | undefined): string | null => {
  if (tenantId === undefined || tenantId === null) {
    return null;
  }

  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeMetaObject = <TMeta extends object>(
  meta: TMeta | undefined
): TMeta => {
  return (meta ?? EMPTY_META) as TMeta;
};

type StorageUploadLedgerTableDefinition<
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
    tenantId: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: false;
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
    status: CreateColumnConfig<
      Dialect,
      {
        data: StorageUploadStatus;
        dataType: 'string';
        notNull: true;
      }
    >;
    sizeBytes: CreateColumnConfig<
      Dialect,
      {
        data: number;
        dataType: 'number';
        notNull: false;
      }
    >;
    etag: CreateColumnConfig<
      Dialect,
      {
        data: string;
        dataType: 'string';
        notNull: false;
      }
    >;
    expiresAt: CreateColumnConfig<
      Dialect,
      {
        data: Date;
        dataType: 'date';
        notNull: true;
      }
    >;
    issuedAt: CreateColumnConfig<
      Dialect,
      {
        data: Date;
        dataType: 'date';
        notNull: true;
      }
    >;
    uploadedAt: CreateColumnConfig<
      Dialect,
      {
        data: Date;
        dataType: 'date';
        notNull: false;
      }
    >;
    consumedAt: CreateColumnConfig<
      Dialect,
      {
        data: Date;
        dataType: 'date';
        notNull: false;
      }
    >;
    purgedAt: CreateColumnConfig<
      Dialect,
      {
        data: Date;
        dataType: 'date';
        notNull: false;
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
  }
>;

export type MySqlStorageUploadLedgerTable<
  TMeta extends object = Record<string, unknown>,
> = MySqlTableWithColumns<StorageUploadLedgerTableDefinition<'mysql', TMeta>>;
export type PostgresStorageUploadLedgerTable<
  TMeta extends object = Record<string, unknown>,
> = PgTableWithColumns<StorageUploadLedgerTableDefinition<'pg', TMeta>>;
export type SQLiteStorageUploadLedgerTable<
  TMeta extends object = Record<string, unknown>,
> = SQLiteTableWithColumns<StorageUploadLedgerTableDefinition<'sqlite', TMeta>>;

export const createMySqlStorageUploadLedgerTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): MySqlStorageUploadLedgerTable<TMeta> => {
  return mysqlTable(
    name,
    {
      id: mysqlVarchar('id', { length: 191 }).notNull().primaryKey(),
      tenantId: mysqlVarchar('tenant_id', { length: 191 }),
      objectKey: mysqlVarchar('object_key', { length: 512 }).notNull(),
      mimeType: mysqlVarchar('mime_type', { length: 255 }).notNull(),
      status: mysqlVarchar('status', { length: 32 }).notNull().$type<StorageUploadStatus>(),
      sizeBytes: mysqlInt('size_bytes'),
      etag: mysqlVarchar('etag', { length: 255 }),
      expiresAt: mysqlTimestamp('expires_at', { mode: 'date', fsp: 3 }).notNull(),
      issuedAt: mysqlTimestamp('issued_at', { mode: 'date', fsp: 3 }).notNull(),
      uploadedAt: mysqlTimestamp('uploaded_at', { mode: 'date', fsp: 3 }),
      consumedAt: mysqlTimestamp('consumed_at', { mode: 'date', fsp: 3 }),
      purgedAt: mysqlTimestamp('purged_at', { mode: 'date', fsp: 3 }),
      meta: mysqlJson('meta').$type<TMeta>().notNull(),
    },
    (table) => ({
      statusExpiryIndex: mysqlIndex(`${name}_status_expiry_idx`).on(
        table.status,
        table.expiresAt
      ),
      objectKeyIndex: mysqlIndex(`${name}_object_key_idx`).on(table.objectKey),
    })
  ) as MySqlStorageUploadLedgerTable<TMeta>;
};

export const createPostgresStorageUploadLedgerTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): PostgresStorageUploadLedgerTable<TMeta> => {
  return pgTable(
    name,
    {
      id: pgText('id').notNull().primaryKey(),
      tenantId: pgText('tenant_id'),
      objectKey: pgText('object_key').notNull(),
      mimeType: pgText('mime_type').notNull(),
      status: pgText('status').notNull().$type<StorageUploadStatus>(),
      sizeBytes: pgInteger('size_bytes'),
      etag: pgText('etag'),
      expiresAt: pgTimestamp('expires_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }).notNull(),
      issuedAt: pgTimestamp('issued_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }).notNull(),
      uploadedAt: pgTimestamp('uploaded_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }),
      consumedAt: pgTimestamp('consumed_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }),
      purgedAt: pgTimestamp('purged_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }),
      meta: pgJson('meta').$type<TMeta>().notNull(),
    },
    (table) => ({
      statusExpiryIndex: pgIndex(`${name}_status_expiry_idx`).on(
        table.status,
        table.expiresAt
      ),
      objectKeyIndex: pgIndex(`${name}_object_key_idx`).on(table.objectKey),
    })
  ) as PostgresStorageUploadLedgerTable<TMeta>;
};

export const createSqliteStorageUploadLedgerTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): SQLiteStorageUploadLedgerTable<TMeta> => {
  return sqliteTable(
    name,
    {
      id: text('id').notNull().primaryKey(),
      tenantId: text('tenant_id'),
      objectKey: text('object_key').notNull(),
      mimeType: text('mime_type').notNull(),
      status: text('status').notNull().$type<StorageUploadStatus>(),
      sizeBytes: integer('size_bytes'),
      etag: text('etag'),
      expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
      issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
      uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }),
      consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
      purgedAt: integer('purged_at', { mode: 'timestamp_ms' }),
      meta: text('meta', { mode: 'json' }).$type<TMeta>().notNull(),
    },
    (table) => ({
      statusExpiryIndex: sqliteIndex(`${name}_status_expiry_idx`).on(
        table.status,
        table.expiresAt
      ),
      objectKeyIndex: sqliteIndex(`${name}_object_key_idx`).on(table.objectKey),
    })
  ) as SQLiteStorageUploadLedgerTable<TMeta>;
};

type StorageUploadLedgerRow<TMeta extends object> = {
  id: string;
  tenantId: string | null;
  objectKey: string;
  mimeType: string;
  status: StorageUploadStatus;
  sizeBytes: number | null;
  etag: string | null;
  expiresAt: Date;
  issuedAt: Date;
  uploadedAt: Date | null;
  consumedAt: Date | null;
  purgedAt: Date | null;
  meta: TMeta;
};

type AnyStorageUploadLedgerTable<TMeta extends object> =
  | MySqlStorageUploadLedgerTable<TMeta>
  | PostgresStorageUploadLedgerTable<TMeta>
  | SQLiteStorageUploadLedgerTable<TMeta>;

class BaseDrizzleStorageUploadLedgerService<
  TDb extends AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  TTable extends AnyStorageUploadLedgerTable<TMeta>,
  TMeta extends object = Record<string, unknown>,
> extends AbstractStorageUploadLedgerService<TMeta> {
  protected readonly db: TDb;
  protected readonly table: TTable;
  private readonly internal: {
    db: AnyMySqlDatabase;
    table: MySqlStorageUploadLedgerTable<TMeta>;
  };

  constructor(db: TDb, table: TTable) {
    super();
    this.db = db;
    this.table = table;
    this.internal = {
      db: db as AnyMySqlDatabase,
      table: table as MySqlStorageUploadLedgerTable<TMeta>,
    };
  }

  private selectShape() {
    const { table } = this.internal;

    return {
      id: table.id,
      tenantId: table.tenantId,
      objectKey: table.objectKey,
      mimeType: table.mimeType,
      status: table.status,
      sizeBytes: table.sizeBytes,
      etag: table.etag,
      expiresAt: table.expiresAt,
      issuedAt: table.issuedAt,
      uploadedAt: table.uploadedAt,
      consumedAt: table.consumedAt,
      purgedAt: table.purgedAt,
      meta: table.meta,
    };
  }

  private toRecord(
    row: StorageUploadLedgerRow<TMeta>
  ): StorageUploadLedgerRecord<TMeta> {
    return {
      ...row,
      tenantId: normalizeTenantId(row.tenantId),
      sizeBytes: row.sizeBytes ?? null,
      etag: row.etag ?? null,
      uploadedAt: row.uploadedAt ?? null,
      consumedAt: row.consumedAt ?? null,
      purgedAt: row.purgedAt ?? null,
      meta: normalizeMetaObject(row.meta),
    };
  }

  private normalizeRow(
    input: UpsertStorageUploadLedgerInput<TMeta>,
    existing: StorageUploadLedgerRecord<TMeta> | null
  ): StorageUploadLedgerRow<TMeta> {
    const tenantId = normalizeTenantId(input.tenantId ?? existing?.tenantId);

    return {
      id: normalizeRequiredString(input.id, 'id'),
      tenantId,
      objectKey: normalizeRequiredString(input.objectKey, 'objectKey'),
      mimeType: normalizeRequiredString(input.mimeType, 'mimeType'),
      status: input.status,
      sizeBytes: input.sizeBytes ?? existing?.sizeBytes ?? null,
      etag: input.etag ?? existing?.etag ?? null,
      expiresAt: input.expiresAt,
      issuedAt: input.issuedAt ?? existing?.issuedAt ?? new Date(),
      uploadedAt:
        input.uploadedAt === undefined
          ? (existing?.uploadedAt ?? null)
          : input.uploadedAt,
      consumedAt:
        input.consumedAt === undefined
          ? (existing?.consumedAt ?? null)
          : input.consumedAt,
      purgedAt:
        input.purgedAt === undefined
          ? (existing?.purgedAt ?? null)
          : input.purgedAt,
      meta: normalizeMetaObject(input.meta ?? existing?.meta),
    };
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
    row: StorageUploadLedgerRow<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>> {
    throw new Error('Not implemented');
  }

  override async get(
    id: string
  ): Promise<StorageUploadLedgerRecord<TMeta> | null> {
    const { db, table } = this.internal;
    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(eq(table.id, normalizeRequiredString(id, 'id')))
      .limit(1)
      .execute()) as StorageUploadLedgerRow<TMeta>[];
    const row = rows[0];

    return row ? this.toRecord(row) : null;
  }

  override async listExpired(
    options: ListExpiredStorageUploadsOptions = {}
  ): Promise<StorageUploadLedgerRecord<TMeta>[]> {
    const { db, table } = this.internal;
    const expiresBefore = options.expiresBefore ?? new Date();
    const statuses = options.statuses ?? ['ISSUED', 'UPLOADED'];
    const conditions: SQL[] = [lte(table.expiresAt, expiresBefore)];

    if (statuses.length > 0) {
      conditions.push(inArray(table.status, statuses));
    }

    if (options.tenantId !== undefined) {
      const tenantId = normalizeTenantId(options.tenantId);

      if (tenantId === null) {
        conditions.push(isNull(table.tenantId));
      } else {
        conditions.push(eq(table.tenantId, tenantId));
      }
    }

    const rows = (await db
      .select(this.selectShape())
      .from(table)
      .where(this.combineConditions(conditions))
      .orderBy(asc(table.expiresAt), asc(table.id))
      .limit(clampLimit(options.limit))
      .execute()) as StorageUploadLedgerRow<TMeta>[];

    return rows.map((row) => this.toRecord(row));
  }

  override async upsert(
    input: UpsertStorageUploadLedgerInput<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>> {
    const existing = await this.get(input.id);
    const row = this.normalizeRow(input, existing);

    return await this.persist(row);
  }
}

class MySqlDrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
> extends BaseDrizzleStorageUploadLedgerService<
  AnyMySqlDatabase,
  MySqlStorageUploadLedgerTable<TMeta>,
  TMeta
> {
  protected override async persist(
    row: StorageUploadLedgerRow<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>> {
    await this.db
      .insert(this.table)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          tenantId: row.tenantId,
          objectKey: row.objectKey,
          mimeType: row.mimeType,
          status: row.status,
          sizeBytes: row.sizeBytes,
          etag: row.etag,
          expiresAt: row.expiresAt,
          issuedAt: row.issuedAt,
          uploadedAt: row.uploadedAt,
          consumedAt: row.consumedAt,
          purgedAt: row.purgedAt,
          meta: row.meta,
        },
      })
      .execute();

    return row;
  }
}

class PostgresDrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
> extends BaseDrizzleStorageUploadLedgerService<
  AnyPostgresDatabase,
  PostgresStorageUploadLedgerTable<TMeta>,
  TMeta
> {
  protected override async persist(
    row: StorageUploadLedgerRow<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>> {
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: this.table.id,
        set: {
          tenantId: row.tenantId,
          objectKey: row.objectKey,
          mimeType: row.mimeType,
          status: row.status,
          sizeBytes: row.sizeBytes,
          etag: row.etag,
          expiresAt: row.expiresAt,
          issuedAt: row.issuedAt,
          uploadedAt: row.uploadedAt,
          consumedAt: row.consumedAt,
          purgedAt: row.purgedAt,
          meta: row.meta,
        },
      })
      .execute();

    return row;
  }
}

class SqliteDrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
> extends BaseDrizzleStorageUploadLedgerService<
  AnySQLiteDatabase,
  SQLiteStorageUploadLedgerTable<TMeta>,
  TMeta
> {
  protected override async persist(
    row: StorageUploadLedgerRow<TMeta>
  ): Promise<StorageUploadLedgerRecord<TMeta>> {
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: this.table.id,
        set: {
          tenantId: row.tenantId,
          objectKey: row.objectKey,
          mimeType: row.mimeType,
          status: row.status,
          sizeBytes: row.sizeBytes,
          etag: row.etag,
          expiresAt: row.expiresAt,
          issuedAt: row.issuedAt,
          uploadedAt: row.uploadedAt,
          consumedAt: row.consumedAt,
          purgedAt: row.purgedAt,
          meta: row.meta,
        },
      })
      .run();

    return row;
  }
}

export function DrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnyMySqlDatabase,
  table: MySqlStorageUploadLedgerTable<TMeta>
): AbstractStorageUploadLedgerService<TMeta>;
export function DrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnyPostgresDatabase,
  table: PostgresStorageUploadLedgerTable<TMeta>
): AbstractStorageUploadLedgerService<TMeta>;
export function DrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnySQLiteDatabase,
  table: SQLiteStorageUploadLedgerTable<TMeta>
): AbstractStorageUploadLedgerService<TMeta>;
export function DrizzleStorageUploadLedgerService<
  TMeta extends object = Record<string, unknown>,
>(
  db: AnyMySqlDatabase | AnyPostgresDatabase | AnySQLiteDatabase,
  table: AnyStorageUploadLedgerTable<TMeta>
): AbstractStorageUploadLedgerService<TMeta> {
  if (is(db, MySqlDatabase)) {
    return new MySqlDrizzleStorageUploadLedgerService(
      db,
      table as MySqlStorageUploadLedgerTable<TMeta>
    );
  }

  if (is(db, PgDatabase)) {
    return new PostgresDrizzleStorageUploadLedgerService(
      db,
      table as PostgresStorageUploadLedgerTable<TMeta>
    );
  }

  if (is(db, BaseSQLiteDatabase)) {
    return new SqliteDrizzleStorageUploadLedgerService(
      db,
      table as SQLiteStorageUploadLedgerTable<TMeta>
    );
  }

  throw new Error('Unsupported dialect');
}
