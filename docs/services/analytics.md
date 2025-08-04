# Analytics Services

Edge Kit provides abstract and concrete implementations for analytics services, allowing you to track and analyze user behavior and application events.

## Overview

The analytics services allow you to:

- Track user events and actions
- Identify users for consistent tracking
- Reset user identity when needed
- Track events both client-side and server-side

## Abstract Analytics Service

The `AbstractAnalytics` interface defines the contract that all analytics implementations must follow:

```typescript
export interface AbstractAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T> {
  capture<TEvent extends K>(event: TEvent, properties: T[TEvent]): void;
  identify(distinctId?: string): void;
  reset(): void;
}

export interface AbstractServerSideAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T> {
  capture<TEvent extends K>(event: TEvent, properties: T[TEvent], distinctId: string): void;
  shutdown(): Promise<void>;
}
```

## Available Implementations

Edge Kit provides the following analytics implementations:

### PostHogAnalytics

A client-side analytics implementation using PostHog.

**Location**: `src/services/analytics/posthog-analytics.ts`

**Dependencies**:

- `posthog-js`

**Usage**:

```typescript
import { PosthogAnalytics } from '../services/analytics/posthog-analytics';

// Define your analytics events with strong typing
interface MyAnalyticsEvents {
  page_view: {
    page: string;
    referrer?: string;
    user_type: 'guest' | 'member' | 'admin';
  };
  button_click: {
    button_id: string;
    page: string;
  };
  purchase_complete: {
    order_id: string;
    amount: number;
    currency: string;
    items: Array<{ product_id: string; quantity: number; price: number }>;
  };
}

// Create the analytics instance
const analytics = new PosthogAnalytics<MyAnalyticsEvents>(
  'phc_YourPostHogToken',
  { api_host: 'https://eu.posthog.com' }, // Optional configuration
);

// Identify a user
analytics.identify('user-123');

// Track events with type-safe properties
analytics.capture('page_view', {
  page: '/dashboard',
  user_type: 'member',
});

analytics.capture('button_click', {
  button_id: 'signup-button',
  page: '/landing',
});

// Reset user identity (e.g., on logout)
analytics.reset();
```

### PostHogServerAnalytics

A server-side analytics implementation using PostHog Node.js SDK.

**Location**: `src/services/analytics/posthog-server-analytics.ts`

**Dependencies**:

- `posthog-node`

**Usage**:

```typescript
import { PostHogServerAnalytics } from '../services/analytics/posthog-server-analytics';

// Define your analytics events with strong typing
interface MyServerAnalyticsEvents {
  api_request: {
    endpoint: string;
    method: string;
    status_code: number;
    duration_ms: number;
  };
  user_signup: {
    signup_method: 'email' | 'google' | 'github';
    referrer?: string;
  };
}

// Create the analytics instance
const serverAnalytics = new PostHogServerAnalytics<MyServerAnalyticsEvents>(
  'phc_YourPostHogToken',
  { host: 'https://eu.posthog.com' }, // Optional configuration
);

// Track events with type-safe properties
serverAnalytics.capture(
  'api_request',
  {
    endpoint: '/api/users',
    method: 'GET',
    status_code: 200,
    duration_ms: 52,
  },
  'user-123',
); // user distinct ID

// Always shut down before your application exits
process.on('beforeExit', async () => {
  await serverAnalytics.shutdown();
});
```

## Common Operations

### Client-Side Event Tracking

```typescript
// Basic event tracking
analytics.capture('page_view', {
  page: '/products',
  referrer: document.referrer,
  user_type: user?.role || 'guest',
});

// Track user interactions
analytics.capture('button_click', {
  button_id: 'add-to-cart',
  page: '/products/123',
});

// Track conversions
analytics.capture('purchase_complete', {
  order_id: order.id,
  amount: order.total,
  currency: 'USD',
  items: order.items.map((item) => ({
    product_id: item.id,
    quantity: item.quantity,
    price: item.price,
  })),
});
```

### User Identification

```typescript
// Identify a user after login
function onUserLogin(user) {
  analytics.identify(user.id);

  // You can also set user properties in PostHog
  posthog.people.set({
    email: user.email,
    name: user.name,
    plan: user.subscriptionTier,
    signup_date: user.createdAt,
  });
}

// Reset on logout
function onUserLogout() {
  analytics.reset();
}
```

### Server-Side Event Tracking

```typescript
// Track backend events
async function processOrder(order, userId) {
  // Process the order...

  // Track the event
  serverAnalytics.capture(
    'order_processed',
    {
      order_id: order.id,
      processing_time_ms: performance.now() - startTime,
      payment_method: order.paymentMethod,
      total_items: order.items.length,
    },
    userId,
  );
}

// Track API usage
app.use((req, res, next) => {
  const startTime = performance.now();

  // Once the response is finished
  res.on('finish', () => {
    const duration = performance.now() - startTime;

    serverAnalytics.capture(
      'api_request',
      {
        endpoint: req.path,
        method: req.method,
        status_code: res.statusCode,
        duration_ms: Math.round(duration),
        user_agent: req.headers['user-agent'],
      },
      req.user?.id || 'anonymous',
    );
  });

  next();
});
```

## Type-Safe Analytics

The Edge Kit analytics services use TypeScript generics to provide type safety for your events and properties:

```typescript
// Define your event schema
interface MyAnalyticsEvents {
  page_view: {
    page: string;
    // Other properties...
  };
  form_submit: {
    form_id: string;
    success: boolean;
    // Other properties...
  };
  // Other events...
}

// Create a typed analytics instance
const analytics = new PosthogAnalytics<MyAnalyticsEvents>('phc_YourPostHogToken');

// Type-safe event tracking
analytics.capture('page_view', {
  page: '/dashboard', // Required
  // If you try to add properties not in the schema, TypeScript will error
});

// TypeScript will error if event name doesn't exist in schema
// analytics.capture('invalid_event', {}); // Error!

// TypeScript will error if required properties are missing
// analytics.capture('form_submit', {}); // Error! Missing required properties
```

## Integration with Feature Flags

Analytics services work well with feature flags for A/B testing:

```typescript
import { PosthogAnalytics } from '../services/analytics/posthog-analytics';
import { FeatureFlagService } from '../services/feature-flag/feature-flag';

// Define analytics events
interface MyAnalyticsEvents {
  experiment_viewed: {
    experiment_id: string;
    variant: string;
  };
  conversion: {
    experiment_id?: string;
    variant?: string;
    action: string;
  };
}

// Setup analytics
const analytics = new PosthogAnalytics<MyAnalyticsEvents>('phc_YourPostHogToken');

// Setup feature flags
const featureFlags = new FeatureFlagService({
  NEW_CHECKOUT_FLOW: { rolloutPercentage: 0.5 }, // A/B test with 50% of users
});

// Usage in application
function renderCheckoutPage(userId: string) {
  // Check which variant the user gets
  const useNewCheckoutFlow = featureFlags.isEnabled('NEW_CHECKOUT_FLOW', userId);

  // Track experiment view
  analytics.capture('experiment_viewed', {
    experiment_id: 'checkout_redesign',
    variant: useNewCheckoutFlow ? 'new' : 'control',
  });

  // Render appropriate variant
  if (useNewCheckoutFlow) {
    renderNewCheckout();
  } else {
    renderOldCheckout();
  }
}

// Track conversion
function onPurchaseComplete(orderId: string, userId: string) {
  // Check which variant the user saw
  const useNewCheckoutFlow = featureFlags.isEnabled('NEW_CHECKOUT_FLOW', userId);

  // Track conversion with experiment data
  analytics.capture('conversion', {
    experiment_id: 'checkout_redesign',
    variant: useNewCheckoutFlow ? 'new' : 'control',
    action: 'purchase',
  });
}
```

## Best Practices

1. **Event Naming Convention**: Use a consistent naming convention for events:

```typescript
// Good: Consistent noun_verb pattern
analytics.capture('page_view', { page: '/dashboard' });
analytics.capture('button_click', { button_id: 'signup' });
analytics.capture('form_submit', { form_id: 'contact' });

// Bad: Inconsistent naming
analytics.capture('ViewedPage', { page: '/dashboard' });
analytics.capture('clicked_button', { button_id: 'signup' });
analytics.capture('submittingForm', { form_id: 'contact' });
```

2. **Property Consistency**: Use consistent property names across events:

```typescript
// Good: Consistent property names
analytics.capture('page_view', { page: '/dashboard' });
analytics.capture('button_click', { page: '/dashboard', button_id: 'save' });

// Bad: Inconsistent property names
analytics.capture('page_view', { page_path: '/dashboard' });
analytics.capture('button_click', { page_url: '/dashboard', btn_id: 'save' });
```

3. **Schema Definition**: Define your event schema upfront:

```typescript
// Define a complete schema at the start
interface AnalyticsEvents {
  // User journey events
  page_view: {
    page: string;
    referrer?: string;
    user_type: 'guest' | 'member' | 'admin';
  };
  signup_started: {
    referrer?: string;
    signup_method: 'email' | 'google' | 'github';
  };
  signup_completed: {
    signup_method: 'email' | 'google' | 'github';
    time_to_complete_seconds: number;
  };

  // Engagement events
  button_click: {
    button_id: string;
    page: string;
  };
  feature_used: {
    feature_id: string;
    action: string;
  };

  // Business events
  purchase_started: {
    product_id: string;
    price: number;
    currency: string;
  };
  purchase_completed: {
    order_id: string;
    total: number;
    currency: string;
    products: string[];
  };
}
```

4. **Privacy Considerations**: Never track personally identifiable information (PII) unless necessary:

```typescript
// Good: No direct PII in event properties
analytics.capture('form_submit', {
  form_id: 'profile',
  fields_completed: 5,
  has_avatar: Boolean(user.avatarUrl),
});

// Bad: Contains PII in event properties
analytics.capture('form_submit', {
  form_id: 'profile',
  email: user.email, // Don't track this!
  name: user.name, // Don't track this!
  phone: user.phone, // Don't track this!
});
```

5. **Server-Side Shutdown**: Always shut down server-side clients:

```typescript
// Ensure analytics client shuts down properly
process.on('SIGTERM', async () => {
  console.log('Shutting down analytics...');
  await serverAnalytics.shutdown();
  process.exit(0);
});
```

## Custom Implementations

You can create your own analytics implementation by implementing the `AbstractAnalytics` interface:

```typescript
import { AbstractAnalytics } from '../services/analytics/abstract-analytics';

export class CustomAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T>
  implements AbstractAnalytics<T, K>
{
  constructor(
    private apiKey: string,
    private endpoint: string,
  ) {
    // Initialize your analytics client
  }

  capture<TEvent extends K>(event: TEvent, properties: T[TEvent]): void {
    // Implement event tracking
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        event: String(event),
        properties,
        timestamp: new Date().toISOString(),
      }),
    }).catch((error) => {
      console.error('Analytics error:', error);
    });
  }

  identify(distinctId?: string): void {
    // Implement user identification
    // ...
  }

  reset(): void {
    // Implement identity reset
    // ...
  }
}
```
