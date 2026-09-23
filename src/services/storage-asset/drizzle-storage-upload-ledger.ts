import { and, asc, eq, inArray, is, isNull, lte, type SQL } from 'drizzle-orm';
import {
  MySqlDatabase,
  type MySqlTableWithColumns,
  index as mysqlIndex,
  int as mysqlInt,
  json as mysqlJson,
  mysqlTable,
  timestamp as mysqlTimestamp,
  varchar as mysqlVarchar,
} from 'drizzle-orm/mysql-core';
import {
  PgDatabase,
  type PgTableWithColumns,
  index as pgIndex,
  integer as pgInteger,
  json as pgJson,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
} from 'drizzle-orm/pg-core';
import {
  BaseSQLiteDatabase,
  integer,
  type SQLiteTableWithColumns,
  index as sqliteIndex,
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

const normalizeTenantId = (
  tenantId: string | null | undefined
): string | null => {
  if (tenantId === undefined || tenantId === null) {
    return null;
  }

  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeMetaObject = <TMeta extends object>(
  meta: TMeta | undefined
): TMeta => (meta ?? EMPTY_META) as TMeta;

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
): MySqlStorageUploadLedgerTable<TMeta> =>
  mysqlTable(
    name,
    {
      consumedAt: mysqlTimestamp('consumed_at', { fsp: 3, mode: 'date' }),
      etag: mysqlVarchar('etag', { length: 255 }),
      expiresAt: mysqlTimestamp('expires_at', {
        fsp: 3,
        mode: 'date',
      }).notNull(),
      id: mysqlVarchar('id', { length: 191 }).notNull().primaryKey(),
      issuedAt: mysqlTimestamp('issued_at', { fsp: 3, mode: 'date' }).notNull(),
      meta: mysqlJson('meta').$type<TMeta>().notNull(),
      mimeType: mysqlVarchar('mime_type', { length: 255 }).notNull(),
      objectKey: mysqlVarchar('object_key', { length: 512 }).notNull(),
      purgedAt: mysqlTimestamp('purged_at', { fsp: 3, mode: 'date' }),
      sizeBytes: mysqlInt('size_bytes'),
      status: mysqlVarchar('status', { length: 32 })
        .notNull()
        .$type<StorageUploadStatus>(),
      tenantId: mysqlVarchar('tenant_id', { length: 191 }),
      uploadedAt: mysqlTimestamp('uploaded_at', { fsp: 3, mode: 'date' }),
    },
    (table) => ({
      objectKeyIndex: mysqlIndex(`${name}_object_key_idx`).on(table.objectKey),
      statusExpiryIndex: mysqlIndex(`${name}_status_expiry_idx`).on(
        table.status,
        table.expiresAt
      ),
    })
  ) as MySqlStorageUploadLedgerTable<TMeta>;

export const createPostgresStorageUploadLedgerTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): PostgresStorageUploadLedgerTable<TMeta> =>
  pgTable(
    name,
    {
      consumedAt: pgTimestamp('consumed_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }),
      etag: pgText('etag'),
      expiresAt: pgTimestamp('expires_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }).notNull(),
      id: pgText('id').notNull().primaryKey(),
      issuedAt: pgTimestamp('issued_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }).notNull(),
      meta: pgJson('meta').$type<TMeta>().notNull(),
      mimeType: pgText('mime_type').notNull(),
      objectKey: pgText('object_key').notNull(),
      purgedAt: pgTimestamp('purged_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }),
      sizeBytes: pgInteger('size_bytes'),
      status: pgText('status').notNull().$type<StorageUploadStatus>(),
      tenantId: pgText('tenant_id'),
      uploadedAt: pgTimestamp('uploaded_at', {
        mode: 'date',
        precision: 3,
        withTimezone: true,
      }),
    },
    (table) => ({
      objectKeyIndex: pgIndex(`${name}_object_key_idx`).on(table.objectKey),
      statusExpiryIndex: pgIndex(`${name}_status_expiry_idx`).on(
        table.status,
        table.expiresAt
      ),
    })
  ) as PostgresStorageUploadLedgerTable<TMeta>;

export const createSqliteStorageUploadLedgerTable = <
  TMeta extends object = Record<string, unknown>,
>(
  name = DEFAULT_TABLE_NAME
): SQLiteStorageUploadLedgerTable<TMeta> =>
  sqliteTable(
    name,
    {
      consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
      etag: text('etag'),
      expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
      id: text('id').notNull().primaryKey(),
      issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
      meta: text('meta', { mode: 'json' }).$type<TMeta>().notNull(),
      mimeType: text('mime_type').notNull(),
      objectKey: text('object_key').notNull(),
      purgedAt: integer('purged_at', { mode: 'timestamp_ms' }),
      sizeBytes: integer('size_bytes'),
      status: text('status').notNull().$type<StorageUploadStatus>(),
      tenantId: text('tenant_id'),
      uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }),
    },
    (table) => ({
      objectKeyIndex: sqliteIndex(`${name}_object_key_idx`).on(table.objectKey),
      statusExpiryIndex: sqliteIndex(`${name}_status_expiry_idx`).on(
        table.status,
        table.expiresAt
      ),
    })
  ) as SQLiteStorageUploadLedgerTable<TMeta>;

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
      consumedAt: table.consumedAt,
      etag: table.etag,
      expiresAt: table.expiresAt,
      id: table.id,
      issuedAt: table.issuedAt,
      meta: table.meta,
      mimeType: table.mimeType,
      objectKey: table.objectKey,
      purgedAt: table.purgedAt,
      sizeBytes: table.sizeBytes,
      status: table.status,
      tenantId: table.tenantId,
      uploadedAt: table.uploadedAt,
    };
  }

  private toRecord(
    row: StorageUploadLedgerRow<TMeta>
  ): StorageUploadLedgerRecord<TMeta> {
    return {
      ...row,
      consumedAt: row.consumedAt ?? null,
      etag: row.etag ?? null,
      meta: normalizeMetaObject(row.meta),
      purgedAt: row.purgedAt ?? null,
      sizeBytes: row.sizeBytes ?? null,
      tenantId: normalizeTenantId(row.tenantId),
      uploadedAt: row.uploadedAt ?? null,
    };
  }

  private normalizeRow(
    input: UpsertStorageUploadLedgerInput<TMeta>,
    existing: StorageUploadLedgerRecord<TMeta> | null
  ): StorageUploadLedgerRow<TMeta> {
    const tenantId = normalizeTenantId(input.tenantId ?? existing?.tenantId);

    return {
      consumedAt:
        input.consumedAt === undefined
          ? (existing?.consumedAt ?? null)
          : input.consumedAt,
      etag: input.etag ?? existing?.etag ?? null,
      expiresAt: input.expiresAt,
      id: normalizeRequiredString(input.id, 'id'),
      issuedAt: input.issuedAt ?? existing?.issuedAt ?? new Date(),
      meta: normalizeMetaObject(input.meta ?? existing?.meta),
      mimeType: normalizeRequiredString(input.mimeType, 'mimeType'),
      objectKey: normalizeRequiredString(input.objectKey, 'objectKey'),
      purgedAt:
        input.purgedAt === undefined
          ? (existing?.purgedAt ?? null)
          : input.purgedAt,
      sizeBytes: input.sizeBytes ?? existing?.sizeBytes ?? null,
      status: input.status,
      tenantId,
      uploadedAt:
        input.uploadedAt === undefined
          ? (existing?.uploadedAt ?? null)
          : input.uploadedAt,
    };
  }

  private combineConditions(conditions: SQL[]): SQL | undefined {
    if (conditions.length === 1) {
      return conditions[0];
    }

    if (conditions.length > 1) {
      return and(...conditions);
    }
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
    const [row] = rows;

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
          consumedAt: row.consumedAt,
          etag: row.etag,
          expiresAt: row.expiresAt,
          issuedAt: row.issuedAt,
          meta: row.meta,
          mimeType: row.mimeType,
          objectKey: row.objectKey,
          purgedAt: row.purgedAt,
          sizeBytes: row.sizeBytes,
          status: row.status,
          tenantId: row.tenantId,
          uploadedAt: row.uploadedAt,
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
        set: {
          consumedAt: row.consumedAt,
          etag: row.etag,
          expiresAt: row.expiresAt,
          issuedAt: row.issuedAt,
          meta: row.meta,
          mimeType: row.mimeType,
          objectKey: row.objectKey,
          purgedAt: row.purgedAt,
          sizeBytes: row.sizeBytes,
          status: row.status,
          tenantId: row.tenantId,
          uploadedAt: row.uploadedAt,
        },
        target: this.table.id,
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
        set: {
          consumedAt: row.consumedAt,
          etag: row.etag,
          expiresAt: row.expiresAt,
          issuedAt: row.issuedAt,
          meta: row.meta,
          mimeType: row.mimeType,
          objectKey: row.objectKey,
          purgedAt: row.purgedAt,
          sizeBytes: row.sizeBytes,
          status: row.status,
          tenantId: row.tenantId,
          uploadedAt: row.uploadedAt,
        },
        target: this.table.id,
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
