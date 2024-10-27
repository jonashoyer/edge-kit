import { is } from "drizzle-orm"
import { MySqlDatabase, MySqlQueryResultHKT, MySqlTableWithColumns, PreparedQueryHKTBase } from "drizzle-orm/mysql-core"
import { PgDatabase, PgQueryResultHKT, PgTableWithColumns } from "drizzle-orm/pg-core"
import { BaseSQLiteDatabase, SQLiteTableWithColumns } from "drizzle-orm/sqlite-core"
import { StripeCustomerTable as MySqlStripeCustomerTable, OrganizationMemberTable as MySqlOrganizationMemberTable, StripePaymentManagerMySqlDrizzleAdapter } from "./mysql"
import { StripeCustomerTable as PgStripeCustomerTable, StripePaymentManagerPostgresDrizzleAdapter, StripeSchema } from "./pg"
import { StripeCustomerTable as SQLiteStripeCustomerTable, OrganizationMemberTable as SQLiteOrganizationMemberTable, StripePaymentManagerSQLiteDrizzleAdapter } from "./sqlite"
import Stripe from 'stripe';

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

export type DefaultSchema<Flavor extends SqlFlavorOptions, TMySqlSchema extends Record<TKeys, MySqlTableWithColumns<any>>, TPostgresSchema extends Record<TKeys, PgTableWithColumns<any>>, TSQLiteSchema extends Record<TKeys, SQLiteTableWithColumns<any>>, TKeys extends string = string> =
  Flavor extends AnyMySqlDatabase
  ? TMySqlSchema
  : Flavor extends AnyPostgresDatabase
  ? TPostgresSchema
  : Flavor extends AnySQLiteDatabase
  ? TSQLiteSchema
  : never

export function StripeDrizzleAdapter<SqlFlavor extends SqlFlavorOptions>(
  db: SqlFlavor,
  schema: DefaultSchema<
    SqlFlavor,
    { User: MySqlStripeCustomerTable } | { Organization: MySqlStripeCustomerTable, OrganizationMember: MySqlOrganizationMemberTable },
    StripeSchema,
    { User: SQLiteStripeCustomerTable } | { Organization: SQLiteStripeCustomerTable, OrganizationMember: SQLiteOrganizationMemberTable }
  >
) {
  if (is(db, MySqlDatabase)) {
    return StripePaymentManagerMySqlDrizzleAdapter(db, schema as unknown as MySqlStripeCustomerTable)
  } else if (is(db, PgDatabase)) {
    return StripePaymentManagerPostgresDrizzleAdapter(db, schema as unknown as StripeSchema)
  } else if (is(db, BaseSQLiteDatabase)) {
    return StripePaymentManagerSQLiteDrizzleAdapter(db, schema as unknown as SQLiteStripeCustomerTable)
  }

  throw new Error(`Unsupported database type (${typeof db}) in Stripe Drizzle adapter.`)
}

export interface StripeDrizzleAdapterInterface {
  syncCustomer: (customer: Stripe.Customer) => Promise<void>;
  getCustomerByStripeId: (stripeCustomerId: string) => Promise<any>;
  updateCustomerSubscription: (stripeCustomerId: string, subscriptionData: Stripe.Subscription) => Promise<void>;
  getOrganizationMembers: (organizationId: string) => Promise<any[]>;
}
