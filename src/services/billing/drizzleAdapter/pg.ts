import { GeneratedColumnConfig } from "drizzle-orm";
import { PgColumn, PgDatabase, PgQueryResultHKT, PgTableWithColumns } from "drizzle-orm/pg-core";
import { eq } from 'drizzle-orm';
import { StripeDrizzleAdapterInterface } from './stripeDrizzleAdapter';
import Stripe from 'stripe';

type DefaultPostgresColumn<
  T extends {
    data: string | number | boolean | Date
    dataType: "string" | "number" | "boolean" | "date"
    notNull: boolean
    isPrimaryKey?: boolean
    columnType:
    | "PgVarchar"
    | "PgText"
    | "PgBoolean"
    | "PgTimestamp"
    | "PgInteger"
    | "PgUUID"
  },
> = PgColumn<{
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
export type StripeCustomerTable = PgTableWithColumns<{
  name: string;
  columns: {
    id: DefaultPostgresColumn<{
      columnType: 'PgVarchar' | 'PgText' | 'PgUUID';
      data: string;
      isPrimaryKey: true;
      notNull: true;
      dataType: 'string';
    }>
    stripeCustomerId: DefaultPostgresColumn<{
      columnType: 'PgVarchar' | 'PgText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
  },
  dialect: 'pg',
  schema: string | undefined
}>;


export type OrganizationMemberTable = PgTableWithColumns<{
  name: string;
  columns: {
    organizationId: DefaultPostgresColumn<{
      columnType: 'PgVarchar' | 'PgText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
    userId: DefaultPostgresColumn<{
      columnType: 'PgVarchar' | 'PgText';
      data: string;
      notNull: true;
      dataType: 'string';
    }>
  },
  dialect: 'pg',
  schema: string | undefined
}>;

export type StripeSchema = { User: StripeCustomerTable } | { Organization: StripeCustomerTable, OrganizationMember: OrganizationMemberTable };

export const StripePaymentManagerPostgresDrizzleAdapter = (
  client: PgDatabase<PgQueryResultHKT, any>,
  schema: StripeSchema
): StripeDrizzleAdapterInterface => {
  const stripeCustomerTable = 'User' in schema ? schema.User : schema.Organization;
  return {
    async syncCustomer(customer: Stripe.Customer) {
      await client
        .insert(stripeCustomerTable)
        .values({
          id: customer.id,
          stripeCustomerId: customer.id,
          email: customer.email,
          name: customer.name,
        })
        .onConflictDoUpdate({
          target: stripeCustomerTable.stripeCustomerId,
          set: {
            email: customer.email,
            name: customer.name,
          },
        });
    },

    async getCustomerByStripeId(stripeCustomerId: string) {
      return client
        .select()
        .from(stripeCustomerTable)
        .where(eq(stripeCustomerTable.stripeCustomerId, stripeCustomerId))
        .limit(1);
    },

    async updateCustomerSubscription(stripeCustomerId: string, subscriptionData: Stripe.Subscription) {
      await client
        .update(stripeCustomerTable)
        .set({ subscription: JSON.stringify(subscriptionData) })
        .where(eq(stripeCustomerTable.stripeCustomerId, stripeCustomerId));
    },

    async getOrganizationMembers(organizationId: string) {
      const organizationMemberTable = 'OrganizationMember' in schema ? schema.OrganizationMember : null;
      if (!organizationMemberTable) {
        throw new Error('OrganizationMember table not found in schema');
      }
      return client
        .select()
        .from(organizationMemberTable)
        .where(eq(organizationMemberTable.organizationId, organizationId));
    },
  };
}
