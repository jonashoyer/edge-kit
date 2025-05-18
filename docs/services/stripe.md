# Stripe Integration Services

Edge Kit provides a comprehensive set of services for integrating with Stripe, enabling payment processing, subscription management, and webhook handling in your application.

## Overview

The Stripe integration services allow you to:
- Create checkout sessions for one-time payments and subscriptions
- Process Stripe webhooks
- Manage customer subscriptions
- Synchronize Stripe data with your application
- Create customer portal sessions

## Service Architecture

The Edge Kit Stripe integration consists of several coordinated services:

1. **StripeService**: The main entry point and coordinator
2. **StripeCheckoutService**: Handles creating checkout sessions
3. **StripeWebhookService**: Processes Stripe webhooks
4. **StripeSubscriptionService**: Manages subscription operations
5. **StripeSyncService**: Synchronizes Stripe data with your application
6. **AbstractStripeStore**: Interface for storing Stripe-related data

## Setup and Configuration

### Creating the Stripe Service

```typescript
import { StripeService } from '../services/stripe';
import { MyStripeStore } from './my-stripe-store';
import Stripe from 'stripe';
import { AxiomLogger } from '../services/logging/axiom-logger';

// Create a logger (optional)
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

// Create a Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16', // Use the latest API version
});

// Create your implementation of AbstractStripeStore
const stripeStore = new MyStripeStore();

// Create the Stripe service
const stripeService = new StripeService(
  stripeStore,
  stripe,
  {
    logger,
    baseUrl: process.env.APP_URL!, // Your application URL
    successPath: '/checkout/success', // Path for successful checkouts
    cancelPath: '/checkout/cancel', // Path for canceled checkouts
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    secretKey: process.env.STRIPE_SECRET_KEY!,
  }
);
```

### Implementing the Stripe Store

You need to implement the `AbstractStripeStore` interface to store and retrieve Stripe-related data:

```typescript
import { AbstractStripeStore, CustomerData, SubscriptionData } from '../services/stripe/abstract-stripe-store';

export class MyStripeStore implements AbstractStripeStore {
  // Map users to Stripe customers
  async setStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    // Store in your database
    await db.user.update({
      where: { id: userId },
      data: { stripeCustomerId },
    });
  }

  async getStripeCustomerId(userId: string): Promise<string | null> {
    // Retrieve from your database
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    
    return user?.stripeCustomerId || null;
  }

  async getUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    // Retrieve from your database
    const user = await db.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });
    
    return user?.id || null;
  }

  // Store customer data
  async setCustomerData(stripeCustomerId: string, data: CustomerData): Promise<void> {
    // Store in your database
    await db.stripeCustomer.upsert({
      where: { stripeId: stripeCustomerId },
      update: { data },
      create: { stripeId: stripeCustomerId, data },
    });
  }

  async getCustomerData(stripeCustomerId: string): Promise<CustomerData | null> {
    // Retrieve from your database
    const customer = await db.stripeCustomer.findUnique({
      where: { stripeId: stripeCustomerId },
    });
    
    return customer?.data || null;
  }

  // Store subscription data
  async setSubscriptionData(stripeSubscriptionId: string, data: SubscriptionData): Promise<void> {
    // Store in your database
    await db.stripeSubscription.upsert({
      where: { stripeId: stripeSubscriptionId },
      update: { data },
      create: { stripeId: stripeSubscriptionId, data },
    });
  }

  async getSubscriptionData(stripeSubscriptionId: string): Promise<SubscriptionData | null> {
    // Retrieve from your database
    const subscription = await db.stripeSubscription.findUnique({
      where: { stripeId: stripeSubscriptionId },
    });
    
    return subscription?.data || null;
  }

  async getActiveSubscriptionByUserId(userId: string): Promise<SubscriptionData | null> {
    // Get customer ID first
    const stripeCustomerId = await this.getStripeCustomerId(userId);
    if (!stripeCustomerId) return null;
    
    // Find active subscription
    const customer = await db.stripeCustomer.findUnique({
      where: { stripeId: stripeCustomerId },
      include: { subscriptions: true },
    });
    
    const activeSubscription = customer?.subscriptions.find(sub => 
      sub.data.status === 'active' || sub.data.status === 'trialing'
    );
    
    return activeSubscription?.data || null;
  }
}
```

## Key Features

### Creating Checkout Sessions

#### One-Time Payments

```typescript
// Create a one-time checkout
const checkoutSession = await stripeService.createOneTimeCheckout(
  userId,
  userEmail,
  [
    {
      price: 'price_1234567890', // Stripe price ID
      quantity: 1,
    },
  ],
  {
    metadata: {
      orderId: 'order_123',
    },
  }
);

// Redirect to checkout
return {
  redirectUrl: checkoutSession.url,
};
```

#### Subscription Checkouts

```typescript
// Create a subscription checkout
const checkoutSession = await stripeService.createSubscriptionCheckout(
  userId,
  userEmail,
  'price_1234567890', // Stripe price ID for subscription
  {
    metadata: {
      planType: 'premium',
    },
  }
);

// Redirect to checkout
return {
  redirectUrl: checkoutSession.url,
};
```

### Processing Webhooks

```typescript
// Next.js API route example
import { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';

export const config = {
  api: {
    bodyParser: false, // Don't parse the body, we need the raw buffer
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = await buffer(req);
    const signature = req.headers['stripe-signature'] as string;

    // Process webhook
    await stripeService.handleWebhook(rawBody, signature);

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: 'Webhook error' });
  }
}
```

### Managing Subscriptions

```typescript
// Check if a user has an active subscription
const hasSubscription = await stripeService.hasActiveSubscription(userId);

// Get detailed subscription data
const subscription = await stripeService.getUserSubscription(userId);

// Cancel a subscription at the end of the current period
await stripeService.cancelSubscriptionAtPeriodEnd(userId);

// Resume a subscription that was set to cancel
await stripeService.resumeSubscription(userId);

// Create a customer portal session for self-service
const portalSession = await stripeService.createCustomerPortalSession(
  userId,
  `${process.env.APP_URL}/account`
);

// Redirect to portal
return {
  redirectUrl: portalSession.url,
};
```

### Manually Syncing Stripe Data

```typescript
// Sync stripe data for a user (helpful after imports or migrations)
await stripeService.syncStripeDataForUser(userId);
```

## Common Use Cases

### Setting Up a SaaS Subscription System

```typescript
import { StripeService } from '../services/stripe';
import { MyStripeStore } from './my-stripe-store';
import Stripe from 'stripe';

// Initialize services (typically done once in your app startup)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const stripeStore = new MyStripeStore();
const stripeService = new StripeService(
  stripeStore,
  stripe,
  {
    baseUrl: process.env.APP_URL!,
    successPath: '/account/subscription/success',
    cancelPath: '/pricing',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    secretKey: process.env.STRIPE_SECRET_KEY!,
  }
);

// React component for subscription page
function SubscriptionPage({ user, plans }) {
  // Function to handle subscription
  async function handleSubscribe(planId) {
    try {
      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      
      const { redirectUrl } = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = redirectUrl;
    } catch (error) {
      console.error('Failed to create subscription:', error);
    }
  }
  
  return (
    <div>
      <h1>Choose a Plan</h1>
      
      <div className="plans">
        {plans.map(plan => (
          <div key={plan.id} className="plan-card">
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <p className="price">${plan.price}/month</p>
            <button onClick={() => handleSubscribe(plan.priceId)}>
              Subscribe
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// API route to create a subscription
async function createSubscription(req, res) {
  const { planId } = req.body;
  const userId = req.user.id;
  const userEmail = req.user.email;
  
  try {
    const session = await stripeService.createSubscriptionCheckout(
      userId,
      userEmail,
      planId,
      {
        metadata: {
          planId,
          userId,
        },
      }
    );
    
    return res.status(200).json({ redirectUrl: session.url });
  } catch (error) {
    console.error('Failed to create subscription:', error);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
}

// API route for account management
async function accountManagement(req, res) {
  const userId = req.user.id;
  
  try {
    const session = await stripeService.createCustomerPortalSession(
      userId,
      `${process.env.APP_URL}/account`
    );
    
    return res.status(200).json({ redirectUrl: session.url });
  } catch (error) {
    console.error('Failed to create portal session:', error);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
}
```

### Implementing Usage-Based Billing

```typescript
// Update usage for a metered subscription
async function reportUsage(userId, usageAmount) {
  // Get the user's subscription
  const subscription = await stripeService.getUserSubscription(userId);
  
  if (!subscription) {
    throw new Error('No active subscription found');
  }
  
  // Find the metered price item
  const meteredItem = subscription.items.find(item => 
    item.price.recurring?.usage_type === 'metered'
  );
  
  if (!meteredItem) {
    throw new Error('No metered subscription item found');
  }
  
  // Report usage to Stripe
  await stripe.subscriptionItems.createUsageRecord(
    meteredItem.id,
    {
      quantity: usageAmount,
      timestamp: 'now',
      action: 'increment',
    }
  );
}

// Usage in your application
async function processApiRequest(userId, requestSize) {
  // Process the request...
  
  // Report usage (e.g., per MB processed)
  const usageMB = Math.ceil(requestSize / (1024 * 1024));
  await reportUsage(userId, usageMB);
}
```

### One-Time Product Sales

```typescript
// API route for product purchase
async function purchaseProduct(req, res) {
  const { productId, quantity } = req.body;
  const userId = req.user.id;
  const userEmail = req.user.email;
  
  try {
    // Get product details from your database
    const product = await db.products.findUnique({
      where: { id: productId },
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Create checkout session
    const session = await stripeService.createOneTimeCheckout(
      userId,
      userEmail,
      [
        {
          price: product.stripePriceId,
          quantity,
        },
      ],
      {
        metadata: {
          productId,
          orderId: generateOrderId(),
        },
      }
    );
    
    return res.status(200).json({ redirectUrl: session.url });
  } catch (error) {
    console.error('Failed to create checkout:', error);
    return res.status(500).json({ error: 'Failed to create checkout' });
  }
}
```

## Handling Stripe Webhooks

Stripe sends webhooks for important events that your application should respond to. The `StripeWebhookService` processes these events and updates your store accordingly.

### Key Webhook Events

- `checkout.session.completed`: Checkout was successful
- `customer.subscription.created`: New subscription created
- `customer.subscription.updated`: Subscription details changed
- `customer.subscription.deleted`: Subscription canceled or expired
- `invoice.paid`: Payment succeeded
- `invoice.payment_failed`: Payment failed

### Custom Webhook Handling

You can extend the webhook handling for additional business logic:

```typescript
import { StripeService } from '../services/stripe';
import { MyStripeStore } from './my-stripe-store';
import Stripe from 'stripe';
import { buffer } from 'micro';

// Initialize Stripe service (as shown earlier)
const stripeService = new StripeService(/* ... */);

// Next.js API route for Stripe webhooks
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }
  
  const buf = await buffer(req);
  const signature = req.headers['stripe-signature'];
  
  try {
    // Let StripeService handle the webhook first
    const event = await stripeService.handleWebhook(buf, signature);
    
    // Add custom logic for specific events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Handle completed checkout
        if (session.mode === 'subscription') {
          // New subscription checkout
          await onSubscriptionCreated(session);
        } else if (session.mode === 'payment') {
          // One-time payment
          await processOrder(session);
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        
        // Handle subscription updates
        await handleSubscriptionUpdate(subscription);
        break;
      }
      
      // Add more custom handlers as needed
    }
    
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: 'Webhook error' });
  }
}

// Custom handlers
async function onSubscriptionCreated(session) {
  // Example: Grant access to premium features
  const metadata = session.metadata;
  const userId = metadata.userId;
  
  await db.user.update({
    where: { id: userId },
    data: { isPremium: true },
  });
  
  // Send welcome email
  await sendEmail({
    to: session.customer_email,
    subject: 'Welcome to Premium!',
    template: 'premium-welcome',
  });
}

async function processOrder(session) {
  // Example: Create order in your database
  const metadata = session.metadata;
  const orderId = metadata.orderId;
  
  await db.order.update({
    where: { id: orderId },
    data: { 
      status: 'paid',
      stripePaymentId: session.payment_intent,
    },
  });
  
  // Trigger order fulfillment
  await fulfillOrder(orderId);
}

async function handleSubscriptionUpdate(subscription) {
  // Example: Handle plan changes
  const newPlanId = subscription.items.data[0].price.id;
  const userId = await stripeStore.getUserIdByStripeCustomerId(subscription.customer);
  
  if (!userId) return;
  
  // Update user's plan in your database
  await db.user.update({
    where: { id: userId },
    data: { planId: newPlanId },
  });
  
  // Handle cancellation
  if (subscription.cancel_at_period_end) {
    await db.user.update({
      where: { id: userId },
      data: { willDowngrade: true },
    });
    
    // Send retention email
    await sendEmail({
      to: user.email,
      subject: "We're sorry to see you go",
      template: 'cancellation',
    });
  }
}
```

## Best Practices

### 1. Secure Your Webhook Endpoint

```typescript
// Use the Stripe signature verification
export const config = {
  api: {
    bodyParser: false, // Don't parse the body, we need the raw buffer
  },
};

// Verify signature in your handler
const event = await stripeService.handleWebhook(rawBody, signature);
```

### 2. Handle Idempotency

Stripe may send the same webhook multiple times. Make your handlers idempotent:

```typescript
async function processPayment(paymentIntentId, amount) {
  // Check if already processed
  const existingPayment = await db.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  
  if (existingPayment) {
    // Already processed this payment
    console.log(`Payment ${paymentIntentId} already processed`);
    return;
  }
  
  // Process the payment
  await db.payment.create({
    data: {
      stripePaymentIntentId: paymentIntentId,
      amount,
      status: 'completed',
    },
  });
  
  // Additional processing...
}
```

### 3. Keep Subscription Status in Sync

Use the sync service to ensure your database matches Stripe's data:

```typescript
// Schedule a periodic sync job
async function scheduledSyncJob() {
  // Get all users with stripe customer IDs
  const users = await db.user.findMany({
    where: {
      stripeCustomerId: {
        not: null,
      },
    },
  });
  
  // Sync each user's data
  for (const user of users) {
    try {
      await stripeService.syncStripeDataForUser(user.id);
    } catch (error) {
      console.error(`Failed to sync user ${user.id}:`, error);
    }
  }
}
```

### 4. Proper Error Handling

```typescript
try {
  const session = await stripeService.createSubscriptionCheckout(
    userId,
    userEmail,
    priceId
  );
  
  return { redirectUrl: session.url };
} catch (error) {
  console.error('Stripe error:', error);
  
  // Handle specific errors
  if (error.type === 'StripeCardError') {
    return { error: 'Your card was declined.' };
  } else if (error.type === 'StripeInvalidRequestError') {
    return { error: 'Invalid parameters were supplied to Stripe API.' };
  } else {
    return { error: 'An unexpected error occurred.' };
  }
}
```

### 5. Environment-Specific Configuration

```typescript
// Different configuration for development and production
const stripeConfig = {
  development: {
    baseUrl: 'http://localhost:3000',
    successPath: '/dev/checkout/success',
    cancelPath: '/dev/checkout/cancel',
    webhookSecret: process.env.DEV_STRIPE_WEBHOOK_SECRET!,
    secretKey: process.env.DEV_STRIPE_SECRET_KEY!,
  },
  production: {
    baseUrl: 'https://your-production-app.com',
    successPath: '/checkout/success',
    cancelPath: '/checkout/cancel',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    secretKey: process.env.STRIPE_SECRET_KEY!,
  },
};

// Use the appropriate config
const config = stripeConfig[process.env.NODE_ENV || 'development'];
const stripeService = new StripeService(stripeStore, stripe, config);
```

## Extending the Stripe Integration

You can extend the Stripe integration by inheriting from the base services:

### Custom Checkout Service

```typescript
import { StripeCheckoutService } from '../services/stripe/checkout-service';
import { AbstractStripeStore } from '../services/stripe/abstract-stripe-store';
import Stripe from 'stripe';

class EnhancedCheckoutService extends StripeCheckoutService {
  constructor(
    store: AbstractStripeStore,
    stripe: Stripe,
    options: {
      logger?: any;
      successUrl: string;
      cancelUrl: string;
    }
  ) {
    super(store, stripe, options);
  }
  
  // Add a method for creating checkouts with coupons
  async createSubscriptionCheckoutWithCoupon(
    userId: string,
    email: string,
    priceId: string,
    couponId: string,
    options?: any
  ) {
    // Get or create a customer
    const customerId = await this.getOrCreateCustomer(userId, email);
    
    // Create checkout session with coupon
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: this.options.successUrl,
      cancel_url: this.options.cancelUrl,
      discounts: [{ coupon: couponId }],
      ...options,
    });
    
    return session;
  }
}
```

### Custom Webhook Handler

```typescript
import { StripeWebhookService } from '../services/stripe/webhook-service';
import { StripeSyncService } from '../services/stripe/sync-service';
import Stripe from 'stripe';

class EnhancedWebhookService extends StripeWebhookService {
  constructor(
    syncService: StripeSyncService,
    stripe: Stripe,
    webhookSecret: string,
    logger?: any,
    private emailService?: any
  ) {
    super(syncService, stripe, webhookSecret, logger);
  }
  
  // Override the handleEvent method to add custom logic
  protected async handleEvent(event: Stripe.Event) {
    // Call the parent implementation first
    await super.handleEvent(event);
    
    // Add custom logic
    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        
        // Send a custom email
        if (this.emailService && invoice.customer_email) {
          await this.emailService.sendPaymentSuccessEmail(
            invoice.customer_email,
            {
              amount: invoice.amount_paid,
              currency: invoice.currency,
              date: new Date(invoice.created * 1000).toLocaleDateString(),
            }
          );
        }
        break;
      }
      
      // Add more custom handlers...
    }
  }
}
```

## Testing Stripe Integration

### Setting Up Test Environment

```typescript
import { StripeService } from '../services/stripe';
import { InMemoryStripeStore } from './in-memory-stripe-store'; // Mock store for testing
import Stripe from 'stripe';

// Create a test stripe instance using the test key
const testStripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY!);

// Create an in-memory store for testing
class InMemoryStripeStore implements AbstractStripeStore {
  private customerMap = new Map<string, string>();
  private customerData = new Map<string, CustomerData>();
  private subscriptionData = new Map<string, SubscriptionData>();
  
  // Implement the abstract methods...
}

// Create the test service
const testStripeService = new StripeService(
  new InMemoryStripeStore(),
  testStripe,
  {
    baseUrl: 'http://localhost:3000',
    successPath: '/test/success',
    cancelPath: '/test/cancel',
    webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET!,
    secretKey: process.env.STRIPE_TEST_SECRET_KEY!,
  }
);

// Now you can use testStripeService in your tests
```

### Testing Webhooks Locally

Using the Stripe CLI for local webhook testing:

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli

# Start forwarding webhooks to localhost
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe

# Trigger test webhook events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
```

### Mocking Stripe Responses

```typescript
// Mock Stripe for unit tests
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test_123',
      }),
    },
    // Mock other methods as needed
  }));
});

// Test creating a checkout session
test('creates a subscription checkout session', async () => {
  const result = await stripeService.createSubscriptionCheckout(
    'user_123',
    'test@example.com',
    'price_123'
  );
  
  expect(result.url).toBe('https://checkout.stripe.com/test');
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      customer: 'cus_test_123',
      line_items: [{ price: 'price_123', quantity: 1 }],
      mode: 'subscription',
    })
  );
});
```
