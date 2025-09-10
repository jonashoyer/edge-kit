# Stripe B2B Implementation Guide

## Analysis of Current Implementations

### Nuanced-AI Implementation (Production B2B SaaS)

The nuanced-ai project has a sophisticated B2B Stripe implementation with several advanced features:

**Key Components:**

- **BillingService**: Centralized singleton service handling all Stripe operations
- **Database Integration**: Direct PostgreSQL storage with Drizzle ORM
- **Organization-based Billing**: Subscriptions tied to organizations, not individual users
- **Admin Features**: Comprehensive admin endpoints for managing subscriptions
- **Promotion Codes**: Full support for coupons and promotion codes
- **Subscription Switching**: Ability to change plans in-place with proration

**Advanced B2B Features:**

- Organization-level customer mapping (not just user-level)
- Subscription checkout offers (pre-configured pricing before checkout)
- Development simulation endpoints for testing subscription states
- Customer portal integration for self-service billing management

### Edge-Kit Implementation (Portable Library)

The edge-kit has a clean, modular foundation but is currently user-focused:

**Strengths:**

- Clean separation of concerns with abstract interfaces
- KV store abstraction for different storage backends
- Comprehensive webhook handling with proper event filtering
- Single source of truth pattern with syncStripeData
- Excellent example implementations and documentation

## Portable B2B Stripe Service Design

### Core Architecture

```typescript
// B2B-specific types extending the current foundation
export interface OrganizationSubscriptionData extends StripeSubscription {
  organizationId: string;
  adminUserId: string; // Who can manage billing
  metadata?: Record<string, any>;
  promotionCode?: PromotionCodeData;
  checkoutOffer?: SubscriptionOfferData; // Pre-configured pricing
}

export interface SubscriptionOfferData {
  currency: 'usd' | 'eur' | string;
  unitAmount: number; // in cents
  interval: 'month' | 'year';
  trialEndUnix?: number;
  promotionCode?: PromotionCodeData;
  description?: string;
}
```

### 1. Enhanced Storage Layer

**Abstract B2B Store Interface:**

```typescript
export abstract class AbstractStripeB2BStore extends AbstractStripeStore {
  // Organization Management
  abstract setOrganizationToCustomerMapping(orgId: string, customerId: string): Promise<void>;
  abstract getStripeCustomerIdByOrg(orgId: string): Promise<string | null>;
  abstract getOrganizationByCustomerId(customerId: string): Promise<string | null>;

  // Organization Subscription Data
  abstract setOrganizationSubscription(orgId: string, data: OrganizationSubscriptionData): Promise<void>;
  abstract getOrganizationSubscription(orgId: string): Promise<OrganizationSubscriptionData | null>;

  // Subscription Offers (pre-checkout pricing)
  abstract setSubscriptionOffer(orgId: string, offer: SubscriptionOfferData): Promise<void>;
  abstract getSubscriptionOffer(orgId: string): Promise<SubscriptionOfferData | null>;
  abstract removeSubscriptionOffer(orgId: string): Promise<void>;

  // User-to-Organization mapping for permission checks
  abstract getUserOrganizations(userId: string): Promise<string[]>;
  abstract isUserOrgAdmin(userId: string, orgId: string): Promise<boolean>;
}
```

### 2. B2B Billing Service

**Core Service:**

```typescript
export class StripeB2BService {
  private store: AbstractStripeB2BStore;
  private stripe: Stripe;
  private syncService: StripeSyncService;
  private webhookService: StripeWebhookService;
  private crmIntegration?: CRMIntegration;

  // Organization-level customer management
  async findOrCreateOrganizationCustomer(orgId: string, adminEmail: string): Promise<string>;

  // Checkout with pre-configured offers
  async createOrganizationCheckout(orgId: string, adminUserId: string): Promise<Stripe.Checkout.Session>;

  // Subscription management
  async switchOrganizationSubscription(orgId: string, newOffer: SubscriptionOfferData): Promise<void>;
  async resumeOrganizationSubscription(orgId: string): Promise<void>;
  async cancelOrganizationSubscription(orgId: string): Promise<void>;

  // Admin operations
  async setSubscriptionOffer(orgId: string, offer: SubscriptionOfferData): Promise<void>;
  async createCustomerPortalSession(orgId: string, returnUrl: string): Promise<string>;

  // Promotion codes
  async validatePromotionCode(code: string): Promise<PromotionCodeData | null>;
  async listPromotionCodes(activeOnly?: boolean): Promise<PromotionCodeData[]>;
}
```

### 3. CRM Integration Pattern

**Abstract CRM Interface:**

```typescript
export interface CRMPaymentData {
  hasPayment: boolean;
  amount?: number; // in cents
  interval?: 'month' | 'year';
  currency?: string;
  promotionCode?: string;
  trialEnd?: number; // unix timestamp
  status?: string; // subscription status
}

export abstract class AbstractCRMIntegration {
  abstract syncPaymentData(orgId: string, paymentData: CRMPaymentData): Promise<void>;
  abstract getCompanyByDomain(domain: string): Promise<CRMCompany | null>;
}

// Attio implementation
export class AttioCRMIntegration extends AbstractCRMIntegration {
  // Implementation based on nuanced-ai pattern
  async syncPaymentData(orgId: string, paymentData: CRMPaymentData): Promise<void> {
    // Update Attio company record with detailed payment information
    // - Payment status (active/inactive)
    // - Subscription amount and billing interval
    // - Currency and promotion codes applied
    // - Trial end dates for customer success tracking
  }
}
```

### 4. Database Store Implementation

**For projects using databases (alternative to KV):**

```typescript
export class StripeB2BDatabaseStore implements AbstractStripeB2BStore {
  constructor(private db: DatabaseConnection) {}

  // Implement using SQL tables:
  // - organizations (id, stripe_customer_id, subscription_data, subscription_offer)
  // - organization_members (user_id, org_id, role)
  // - stripe_customers (customer_id, org_id)
}
```

### 5. Enhanced Webhook Processing

**Extended webhook events for B2B:**

```typescript
const B2B_WEBHOOK_EVENTS = [
  ...STANDARD_WEBHOOK_EVENTS,
  'invoice.payment_action_required',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'promotion_code.created',
  'promotion_code.updated',
];
```

## Implementation Strategy

### Phase 1: Core B2B Foundation

1. **Extend Type System**: Add organization-centric types
2. **Enhanced Storage**: Create AbstractStripeB2BStore interface
3. **Organization Service**: Core organization-level billing operations
4. **Database Store**: Alternative to KV for complex data relationships

### Phase 2: Advanced Features

1. **Subscription Offers**: Pre-checkout pricing configuration
2. **Promotion Codes**: Full coupon and promotion support
3. **Subscription Switching**: In-place plan changes with proration
4. **Customer Portal**: Self-service billing management

### Phase 3: Enterprise Features

1. **CRM Integration**: Abstract pattern for syncing payment to CRM
2. **Admin Endpoints**: Management APIs for subscription oversight
3. **Multi-tenant Support**: Handle multiple organizations per user

## Key Design Decisions

### 1. Organization-First Architecture

- Subscriptions belong to organizations, not users
- Multiple users can manage the same organization's billing
- Clear permission model (admin vs member roles)

### 2. Flexible Storage Strategy

- KV store for simple deployments (current edge-kit pattern)
- Database store for complex B2B needs (nuanced-ai pattern)
- Abstract interface allows switching between storage types

### 3. CRM Integration Pattern

- Abstract CRM interface for any provider (Attio, HubSpot, etc.)
- Automatic syncing of detailed payment data (amount, interval, currency, promotions, trials)
- Rich subscription metadata for customer success and sales teams
- Optional feature that doesn't break core functionality

### 4. Subscription Offer System

- Pre-configure pricing before checkout (like nuanced-ai)
- Support for trials, promotions, and custom pricing
- Clean separation between offer configuration and checkout execution

### 5. Promotion Code Support

- Full Stripe promotion code and coupon support
- Admin tools for code management

## Migration Path

### From Current Edge-Kit

1. **Backward Compatibility**: Keep existing user-based APIs

### From Nuanced-AI Pattern

1. **Extract Core Logic**: Pull out database-specific code
2. **Abstract Storage**: Replace direct DB calls with store interface
3. **Simplify Dependencies**: Remove app-specific integrations
4. **Standardize Types**: Align with edge-kit type patterns

## Example Usage

```typescript
// Initialize B2B service
const b2bService = new StripeB2BService(
  new StripeB2BDatabaseStore(db), // or StripeB2BKVStore(kv)
  stripe,
  {
    crmIntegration: new AttioCRMIntegration(attio),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    baseUrl: 'https://myapp.com',
  },
);

// Set up an organization with a subscription offer
await b2bService.setSubscriptionOffer('org_123', {
  currency: 'usd',
  unitAmount: 2900, // $29.00
  interval: 'month',
  trialEndUnix: Date.now() / 1000 + 30 * 24 * 60 * 60, // 30 day trial
});

// Create checkout for the organization
const checkout = await b2bService.createOrganizationCheckout('org_123', 'admin_user_456');

// Check organization subscription status
const subscription = await b2bService.getOrganizationSubscription('org_123');
if (subscription?.status === 'active') {
  // Grant access to premium features
}
```

This design provides a clean, portable foundation for B2B Stripe implementations while maintaining the flexibility to work with different storage backends and CRM systems. The modular architecture allows developers to adopt only the pieces they need while providing a clear upgrade path for more sophisticated requirements.
