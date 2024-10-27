import { GeneratedColumnConfig } from "drizzle-orm";
import { BaseSQLiteDatabase, SQLiteColumn, SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";

type DefaultSQLiteColumn<
  T extends {
    data: string | boolean | number | Date
    dataType: "string" | "boolean" | "number" | "date"
    notNull: boolean
    isPrimaryKey?: boolean
    columnType:
    | "SQLiteText"
    | "SQLiteBoolean"
    | "SQLiteTimestamp"
    | "SQLiteInteger"
  },
> = SQLiteColumn<{
  name: string
  isAutoincrement: boolean
  isPrimaryKey: T["isPrimaryKey"] extends true ? true : false
  hasRuntimeDefault: boolean
  generated: GeneratedColumnConfig<T["data"]> | undefined
  columnType: T["columnType"]
  data: T["data"]
  driverParam: string | number | boolean
  notNull: T["notNull"]
  hasDefault: boolean
  enumValues: any
  dataType: T["dataType"]
  tableName: string
}>

// Organization or User dependent on the scenario
export type StripeCustomerTable = SQLiteTableWithColumns<{
  name: string;
  columns: {
    id: DefaultSQLiteColumn<{
      columnType: 'SQLiteText';
      data: string;
      isPrimaryKey: true;
      notNull: true;
      dataType: 'string';
    }>
    stripeCustomerId: DefaultSQLiteColumn<{
      columnType: 'SQLiteText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
  },
  dialect: 'sqlite',
  schema: string | undefined
}>;

export type OrganizationMemberTable = SQLiteTableWithColumns<{
  name: string;
  columns: {
    organizationId: DefaultSQLiteColumn<{
      columnType: 'SQLiteText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
    userId: DefaultSQLiteColumn<{
      columnType: 'SQLiteText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
  },
  dialect: 'sqlite',
  schema: string | undefined
}>;

export const StripePaymentManagerSQLiteDrizzleAdapter = (
  client: BaseSQLiteDatabase<"sync" | "async", any, any>,
  schema: StripeCustomerTable
) => ({

})