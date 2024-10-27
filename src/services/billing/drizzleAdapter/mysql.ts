import { GeneratedColumnConfig } from "drizzle-orm";
import { MySqlColumn, MySqlDatabase, MySqlQueryResultHKT, MySqlTableWithColumns, PreparedQueryHKTBase } from "drizzle-orm/mysql-core";

type DefaultMySqlColumn<
  T extends {
    data: string | number | boolean | Date
    dataType: "string" | "number" | "boolean" | "date"
    notNull: boolean
    isPrimaryKey?: boolean
    columnType:
    | "MySqlVarChar"
    | "MySqlText"
    | "MySqlBoolean"
    | "MySqlTimestamp"
    | "MySqlInt"
  },
> = MySqlColumn<{
  isAutoincrement: boolean
  isPrimaryKey: T["isPrimaryKey"] extends true ? true : false
  hasRuntimeDefault: boolean
  generated: GeneratedColumnConfig<T["data"]> | undefined
  name: string
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
export type StripeCustomerTable = MySqlTableWithColumns<{
  name: string;
  columns: {
    id: DefaultMySqlColumn<{
      columnType: 'MySqlVarChar' | 'MySqlText';
      data: string;
      isPrimaryKey: true;
      notNull: true;
      dataType: 'string';
    }>
    stripeCustomerId: DefaultMySqlColumn<{
      columnType: 'MySqlVarChar' | 'MySqlText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
  },
  dialect: 'mysql',
  schema: string | undefined
}>;

export type OrganizationMemberTable = MySqlTableWithColumns<{
  name: string;
  columns: {
    organizationId: DefaultMySqlColumn<{
      columnType: 'MySqlVarChar' | 'MySqlText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
    userId: DefaultMySqlColumn<{
      columnType: 'MySqlVarChar' | 'MySqlText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
  },
  dialect: 'mysql',
  schema: string | undefined
}>;


export const StripePaymentManagerMySqlDrizzleAdapter = (
  client: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase, any>,
  schema: StripeCustomerTable
) => ({

})