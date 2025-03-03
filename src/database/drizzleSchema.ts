import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'
// import type { AdapterAccount } from 'next-auth/adapters'
import { genId } from '../utils/id-generator'


type AdapterAccount = any;

// Start of Organization Schema (for multi-user applications)

export const Organization = sqliteTable('organization', {
  id: text('id', { length: 20 })
    .primaryKey()
    .$defaultFn(genId),
  name: text('name', { length: 100 }).notNull(),
  plan: text("plan", { length: 20 }).notNull(),
  features: text('features', { mode: 'json' }).default('[]').notNull(),
})

export const OrganizationMember = sqliteTable('organization_member', {
  organizationId: text('organization_id', { length: 20 })
    .notNull()
    .references(() => Organization.id, { onDelete: 'cascade' }),
  userId: text('user_id', { length: 20 })
    .notNull()
    .references(() => User.id, { onDelete: 'cascade' }),
},
  (organizationMember) => ({
    compoundKey: primaryKey({
      columns: [organizationMember.organizationId, organizationMember.userId],
    }),
  })
)

// End of Organization Schema


export const Subscription = sqliteTable("subscription", {
  id: text("id", { length: 20 }).primaryKey().$defaultFn(genId),

  userId: text("user_id", { length: 20 })
    .notNull()
    .references(() => User.id, { onDelete: "cascade" }),
  // OR
  organizationId: text('organization_id', { length: 20 })
    .notNull()
    .references(() => Organization.id, { onDelete: 'cascade' }),

  stripeCustomerId: text('stripe_customer_id', { length: 30 }).notNull().unique(),
  stripePriceId: text("stripe_price_id", { length: 30 }).notNull(),
  stripeSubscriptionId: text("stripe_subscription_id", { length: 30 }).notNull(),

  status: text("status", { length: 20 }).notNull(),

  paidUntil: integer('paid_until', { mode: 'timestamp_ms' }),
  endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
  trialEndsAt: integer('trial_ends_at', { mode: 'timestamp_ms' }),
})


// Start of Authentication Schema

// https://authjs.dev/getting-started/adapters/drizzle

export const User = sqliteTable("user", {
  id: text("id", { length: 20 })
    .primaryKey()
    .$defaultFn(genId),
  name: text("name", { length: 100 }),
  email: text("email", { length: 255 }).unique(),
  emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
  image: text("image", { length: 255 }),

  // Only for non-organization scenario (Remove if using organization)
  plan: text("plan", { length: 20 }).notNull(),
  features: text('features', { mode: 'json' }).default('[]').notNull(),
})

export const Account = sqliteTable(
  "account",
  {
    userId: text("userId", { length: 20 })
      .notNull()
      .references(() => User.id, { onDelete: "cascade" }),
    type: text("type", { length: 20 }).$type<AdapterAccount>().notNull(),
    provider: text("provider", { length: 50 }).notNull(),
    providerAccountId: text("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token", { length: 255 }),
    access_token: text("access_token", { length: 255 }),
    expires_at: integer("expires_at"),
    token_type: text("token_type", { length: 50 }),
    scope: text("scope", { length: 255 }),
    id_token: text("id_token", { length: 255 }),
    session_state: text("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const Session = sqliteTable("session", {
  sessionToken: text("session_token", { length: 255 }).primaryKey(),
  userId: text("user_id", { length: 20 })
    .notNull()
    .references(() => User.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
})

export const VerificationToken = sqliteTable(
  "verification_token",
  {
    identifier: text("identifier", { length: 255 }).notNull(),
    token: text("token", { length: 255 }).notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (verificationToken) => ({
    compositePk: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  })
)

export const Authenticator = sqliteTable(
  "authenticator",
  {
    credentialID: text("credential_id", { length: 255 }).notNull().unique(),
    userId: text("user_id", { length: 20 })
      .notNull()
      .references(() => User.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id", { length: 255 }).notNull(),
    credentialPublicKey: text("credential_public_key", { length: 255 }).notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credential_device_type", { length: 50 }).notNull(),
    credentialBackedUp: integer("credential_backed_up", {
      mode: "boolean",
    }).notNull(),
    transports: text("transports", { length: 255 }),
  },
  (authenticator) => ({
    compositePK: primaryKey({
      columns: [authenticator.userId, authenticator.credentialID],
    }),
  })
)


// End of Authentication Schema
