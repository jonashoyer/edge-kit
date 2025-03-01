import { CreateColumnConfig, CreateTableConfig } from "../../../database/types";

export type BaseStripeCustomerTable<Dialect extends "mysql" | "pg" | "sqlite"> = CreateTableConfig<{
  id: CreateColumnConfig<{
    data: string
    dataType: "string"
    isPrimaryKey: true
    notNull: true
  }, Dialect>
  stripeCustomerId: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  email: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  name: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  subscription: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: false
  }, Dialect>
}, Dialect>

export type BaseOrganizationMemberTable<Dialect extends "mysql" | "pg" | "sqlite"> = CreateTableConfig<{
  organizationId: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
  userId: CreateColumnConfig<{
    data: string
    dataType: "string"
    notNull: true
  }, Dialect>
}, Dialect> 