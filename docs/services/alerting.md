# Alerting Services

Edge Kit provides abstract and concrete implementations for alerting services, allowing you to send notifications and alerts through various channels when important events occur.

## Overview

The alerting services allow you to:
- Send alerts with different severity levels
- Route alerts to various destinations (monitoring systems, chat platforms, etc.)
- Include contextual information with alerts
- Automatically log alerts

## Abstract Alerting Service

The `AbstractAlertingService` class defines the interface that all alerting implementations must follow:

```typescript
export interface AlertOptions {
  severity: 'info' | 'warning' | 'error' | 'critical';
  source?: string;
  tags?: Record<string, string>;
}

export abstract class AbstractAlertingService {
  constructor(protected logger: AbstractLogger) { }

  abstract alert(message: string, options: AlertOptions): Promise<void>;

  protected logAlert(message: string, options: AlertOptions): void {
    const logLevel = options.severity === 'info' ? 'info' : (options.severity === 'warning' ? 'warn' : 'error');
    this.logger.log(message, logLevel, {
      alertSeverity: options.severity,
      alertSource: options.source,
      alertTags: options.tags,
    });
  }
}
```

## Available Implementations

Edge Kit provides the following alerting implementations:

### AxiomAlertingService

An alerting implementation that sends alerts to Axiom.

**Location**: `src/services/alerting/axiom-alerting.ts`

**Dependencies**:
- `@axiomhq/js`
- The `AbstractLogger` implementation of your choice

**Usage**:

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { AxiomAlertingService } from '../services/alerting/axiom-alerting';

// Create logger
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

// Create alerting service
const alerting = new AxiomAlertingService(
  process.env.AXIOM_TOKEN!,
  'alerts-dataset',
  logger
);

// Send an alert
await alerting.alert('Payment processor offline', {
  severity: 'critical',
  source: 'payment-service',
  tags: {
    region: 'us-east-1',
    component: 'stripe-integration',
  },
});
```

### SlackAlertingService

An alerting implementation that sends alerts to Slack channels.

**Location**: `src/services/alerting/slack-alerting.ts`

**Dependencies**:
- `node-fetch` or equivalent HTTP client
- The `AbstractLogger` implementation of your choice

**Usage**:

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { SlackAlertingService } from '../services/alerting/slack-alerting';

// Create logger
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

// Create alerting service
const alerting = new SlackAlertingService(
  {
    webhookUrl: process.env.SLACK_WEBHOOK_URL!,
    channel: '#alerts',
  },
  logger
);

// Send an alert
await alerting.alert('Database connection pool exhausted', {
  severity: 'error',
  source: 'database-service',
  tags: {
    database: 'primary',
    instance: 'db-1',
  },
});
```

### PagerDutyAlertingService

An alerting implementation that creates incidents in PagerDuty.

**Location**: `src/services/alerting/pager-duty-alerting.ts`

**Dependencies**:
- `node-fetch` or equivalent HTTP client
- The `AbstractLogger` implementation of your choice

**Usage**:

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { PagerDutyAlertingService } from '../services/alerting/pager-duty-alerting';

// Create logger
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

// Create alerting service
const alerting = new PagerDutyAlertingService(
  {
    integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY!,
    serviceId: 'YOUR_SERVICE_ID',
  },
  logger
);

// Send an alert
await alerting.alert('API server not responding', {
  severity: 'critical',
  source: 'health-monitor',
  tags: {
    server: 'api-3',
    region: 'eu-west-1',
  },
});
```

## Common Operations

### Sending Alerts with Different Severity Levels

```typescript
// Informational alert
await alerting.alert('New feature enabled for all users', {
  severity: 'info',
  source: 'feature-flag-service',
});

// Warning alert
await alerting.alert('API rate limit at 80%', {
  severity: 'warning',
  source: 'rate-limiter',
  tags: { api: 'search', client: 'mobile-app' },
});

// Error alert
await alerting.alert('Database query timeout', {
  severity: 'error',
  source: 'database-service',
  tags: { query: 'getUserTransactions', timeout: '30s' },
});

// Critical alert
await alerting.alert('Payment processor connection lost', {
  severity: 'critical',
  source: 'payment-service',
  tags: { processor: 'stripe' },
});
```

### Combining Multiple Alerting Channels

You can use multiple alerting services together for redundancy and reaching different audiences:

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { SlackAlertingService } from '../services/alerting/slack-alerting';
import { PagerDutyAlertingService } from '../services/alerting/pager-duty-alerting';

// Create logger
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

// Create alerting services
const slackAlerting = new SlackAlertingService(
  { webhookUrl: process.env.SLACK_WEBHOOK_URL!, channel: '#alerts' },
  logger
);

const pagerDutyAlerting = new PagerDutyAlertingService(
  { integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY!, serviceId: 'service-id' },
  logger
);

// Function to send alert to all channels
async function sendAlert(message: string, options: AlertOptions) {
  // Send to all configured channels
  await Promise.all([
    slackAlerting.alert(message, options),
    // Only page people for critical issues
    options.severity === 'critical' 
      ? pagerDutyAlerting.alert(message, options)
      : Promise.resolve(),
  ]);
}

// Usage
await sendAlert('API Service unhealthy', {
  severity: 'critical',
  source: 'health-monitor',
});
```

## Integration with Monitoring Systems

### Using with Health Checks

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { SlackAlertingService } from '../services/alerting/slack-alerting';

// Create logger and alerting
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

const alerting = new SlackAlertingService(
  { webhookUrl: process.env.SLACK_WEBHOOK_URL!, channel: '#alerts' },
  logger
);

// Health check implementation
async function checkSystemHealth() {
  const healthChecks = {
    database: await checkDatabaseConnection(),
    redis: await checkRedisConnection(),
    api: await checkExternalApiStatus(),
  };
  
  // Check for failures
  const failures = Object.entries(healthChecks)
    .filter(([_, status]) => status !== 'healthy')
    .map(([name, status]) => ({ name, status }));
  
  if (failures.length > 0) {
    // Send alert for failures
    await alerting.alert(
      `System health check failed for ${failures.length} component(s)`,
      {
        severity: failures.some(f => f.status === 'critical') ? 'critical' : 'error',
        source: 'health-monitor',
        tags: {
          failedComponents: failures.map(f => f.name).join(','),
        },
      }
    );
  }
  
  return healthChecks;
}
```

### Error Boundary Pattern

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { SlackAlertingService } from '../services/alerting/slack-alerting';

// Create logger and alerting
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

const alerting = new SlackAlertingService(
  { webhookUrl: process.env.SLACK_WEBHOOK_URL!, channel: '#alerts' },
  logger
);

// Error boundary function
async function withErrorBoundary<T>(
  operation: () => Promise<T>,
  context: { name: string; importance: 'low' | 'medium' | 'high' }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Map importance to severity
    const severityMap = {
      low: 'warning',
      medium: 'error',
      high: 'critical',
    } as const;
    
    // Send alert
    await alerting.alert(
      `Operation "${context.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        severity: severityMap[context.importance],
        source: 'error-boundary',
        tags: {
          operation: context.name,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        },
      }
    );
    
    // Rethrow the error
    throw error;
  }
}

// Usage example
async function processPayment(userId: string, amount: number) {
  return withErrorBoundary(
    async () => {
      // Payment processing logic that might throw
      // ...
    },
    { name: 'processPayment', importance: 'high' }
  );
}
```

## Best Practices

1. **Appropriate Severity Levels**: Use severity levels consistently:

```typescript
// Info: General information, non-urgent
alerting.alert('Daily backup completed successfully', { severity: 'info' });

// Warning: Situations that might need attention but aren't failures
alerting.alert('API rate limit at 80%', { severity: 'warning' });

// Error: Non-critical failures that need attention
alerting.alert('Payment processing delayed', { severity: 'error' });

// Critical: Urgent issues requiring immediate attention
alerting.alert('Database primary node down', { severity: 'critical' });
```

2. **Contextual Information**: Include enough context to understand and diagnose the issue:

```typescript
// Good: Includes specific details
alerting.alert('Database query timeout', {
  severity: 'error',
  source: 'user-service',
  tags: {
    operation: 'getUserProfile',
    userId: '123',
    queryId: 'abc-123',
    durationMs: '5000',
  },
});

// Bad: Lacks details
alerting.alert('Database slow', { severity: 'error' });
```

3. **Alert Routing**: Use sources and tags to route alerts appropriately:

```typescript
// Tagged for appropriate routing
alerting.alert('Payment gateway timeout', {
  severity: 'critical',
  source: 'payment-service', // Team or service responsible
  tags: {
    component: 'stripe-integration',
    environment: 'production',
    region: 'us-east-1',
  },
});
```

4. **Alert Deduplication**: Include unique identifiers for deduplication:

```typescript
// Include identifiers for deduplication
alerting.alert('Rate limit exceeded', {
  severity: 'warning',
  source: 'rate-limiter',
  tags: {
    clientId: client.id,
    endpoint: '/api/search',
    // Include a deduplication key or time window
    dedupeKey: `ratelimit:${client.id}:${new Date().toISOString().slice(0, 13)}`, // Hour-based
  },
});
```

5. **Alert Fatigue Prevention**: Avoid sending too many alerts:

```typescript
// Throttle alerts for high-frequency issues
const lastAlertTime = await cache.get(`last-alert:${errorType}`);
const now = Date.now();

if (!lastAlertTime || (now - parseInt(lastAlertTime)) > 15 * 60 * 1000) { // 15 minutes
  await alerting.alert('High error rate detected', {
    severity: 'error',
    source: 'error-monitor',
    tags: { errorType },
  });
  
  await cache.set(`last-alert:${errorType}`, now.toString(), 60 * 60); // 1 hour TTL
}
```

## Custom Implementations

You can create your own alerting implementation by extending the `AbstractAlertingService` class:

```typescript
import { AbstractAlertingService, AlertOptions } from '../services/alerting/abstract-alerting';
import { AbstractLogger } from '../services/logging/abstract-logger';

export class CustomAlertingService extends AbstractAlertingService {
  constructor(
    private options: {
      endpoint: string;
      apiKey: string;
    },
    logger: AbstractLogger
  ) {
    super(logger);
  }
  
  async alert(message: string, options: AlertOptions): Promise<void> {
    // Log the alert (built into base class)
    this.logAlert(message, options);
    
    // Send to your custom alerting service
    await fetch(this.options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        message,
        severity: options.severity,
        source: options.source,
        tags: options.tags,
        timestamp: new Date().toISOString(),
      }),
    });
  }
}
```
