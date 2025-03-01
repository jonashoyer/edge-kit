import { MySqlTableWithColumns, MySqlDatabase, MySqlQueryResultHKT, PreparedQueryHKTBase } from "drizzle-orm/mysql-core";
import { BaseStripeCustomerTable, BaseOrganizationMemberTable } from "./shared";
import { eq } from 'drizzle-orm';
import { StripeDrizzleAdapterInterface } from './stripeDrizzleAdapter';
import Stripe from 'stripe';

export type StripeCustomerTable = MySqlTableWithColumns<BaseStripeCustomerTable<"mysql">>;
export type OrganizationMemberTable = MySqlTableWithColumns<BaseOrganizationMemberTable<"mysql">>;

export const StripePaymentManagerMySqlDrizzleAdapter = (
  client: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase, any>,
  schema: StripeCustomerTable
): StripeDrizzleAdapterInterface => {
  return {
    async syncCustomer(customer: Stripe.Customer) {
      await client
        .insert(schema)
        .values({
          id: customer.id,
          stripeCustomerId: customer.id,
          email: customer.email,
          name: customer.name,
        })
        .onConflictDoUpdate({
          target: schema.stripeCustomerId,
          set: {
            email: customer.email,
            name: customer.name,
          },
        });
    },

    async getCustomerByStripeId(stripeCustomerId: string) {
      return client
        .select()
        .from(schema)
        .where(eq(schema.stripeCustomerId, stripeCustomerId))
        .limit(1);
    },

    async updateCustomerSubscription(stripeCustomerId: string, subscriptionData: Stripe.Subscription) {
      await client
        .update(schema)
        .set({ subscription: JSON.stringify(subscriptionData) })
        .where(eq(schema.stripeCustomerId, stripeCustomerId));
    },

    async getOrganizationMembers(organizationId: string) {
      throw new Error('Organization members not supported in this schema');
    },
  };
};