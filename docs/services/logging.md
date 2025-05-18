# Logging Services

Edge Kit provides abstract and concrete implementations for logging services, allowing you to capture, format, and store logs across different environments and providers.

## Overview

The logging services allow you to:
- Log messages at different severity levels
- Add contextual metadata to logs
- Route logs to various destinations
- Format logs consistently

## Abstract Logger Service

The `AbstractLogger` class defines the interface that all logger implementations must follow:

```typescript
export abstract class AbstractLogger {
  abstract log(message: string, level: LogLevel, metadata?: Record<string, any>): void;
  
  info(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'info', metadata);
  }
  
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'warn', metadata);
  }
  
  error(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'error', metadata);
  }
  
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'debug', metadata);
  }
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
```

## Available Implementations

Edge Kit provides the following logging implementations:

### AxiomLogger

A direct logging implementation for the Axiom logging platform.

**Location**: `src/services/logging/axiom-logger.ts`

**Dependencies**:
- `@axiomhq/js`

**Usage**:

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';

const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'my-application-logs',
});

// Basic logging
logger.info('User signed in', { userId: '123' });
logger.warn('Rate limit approaching', { userId: '123', currentRate: 95 });
logger.error('Payment failed', { userId: '123', error: 'Card declined' });
```

### AxiomPinoLogger

A logging implementation that uses Pino with Axiom transport for structured logging.

**Location**: `src/services/logging/axiom-pino-logger.ts`

**Dependencies**:
- `pino`
- `@axiomhq/pino`

**Usage**:

```typescript
import { AxiomPinoLogger } from '../services/logging/axiom-pino-logger';

const logger = new AxiomPinoLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'my-application-logs',
  pinoOptions: {
    level: 'info',
  },
});

// Usage is identical to AxiomLogger
logger.info('User signed in', { userId: '123' });
```

## Common Operations

### Basic Logging

```typescript
// Log at different levels
logger.debug('Detailed debug information');
logger.info('Something noteworthy happened');
logger.warn('Something concerning happened');
logger.error('Something went wrong');

// Log with metadata
logger.info('User action', { 
  userId: '123', 
  action: 'login', 
  timestamp: new Date().toISOString() 
});

// Log errors
try {
  // Some operation
} catch (error) {
  logger.error('Operation failed', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}
```

### Structured Logging

Using structured logging with consistent metadata keys helps with filtering and analysis:

```typescript
// Request logging middleware example
app.use((req, res, next) => {
  const requestId = generateRequestId();
  
  // Add context to request
  req.logger = logger;
  req.requestId = requestId;
  
  logger.info('Request received', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  
  // Continue processing
  next();
});

// Later in a route handler
app.get('/api/users/:id', (req, res) => {
  req.logger.info('Fetching user', {
    requestId: req.requestId,
    userId: req.params.id,
  });
  
  // Process request...
});
```

## Integration with Other Services

### Alerting Integration

Loggers work well with alerting services for critical issues:

```typescript
import { AxiomLogger } from '../services/logging/axiom-logger';
import { AxiomAlertingService } from '../services/alerting/axiom-alerting';

// Create logger
const logger = new AxiomLogger({
  token: process.env.AXIOM_TOKEN!,
  dataset: 'application-logs',
});

// Create alerting service using the logger
const alerting = new AxiomAlertingService(
  process.env.AXIOM_TOKEN!,
  'alerts-dataset',
  logger
);

// Log normal events
logger.info('User signed up', { userId: '123' });

// Send critical alerts
alerting.alert('Payment processor offline', {
  severity: 'critical',
  source: 'payment-service',
});
```

### Using with Request Context

Maintaining request context across asynchronous operations:

```typescript
// Create a context helper
function withRequestContext(req, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Log with request context
      req.logger.error('Error in async operation', {
        requestId: req.requestId,
        error: error.message,
      });
      throw error;
    }
  };
}

// Usage in route handler
app.get('/api/data', async (req, res) => {
  const fetchData = withRequestContext(req, async () => {
    // This will log with request context if it fails
    return await someAsyncOperation();
  });
  
  const data = await fetchData();
  res.json(data);
});
```

## Best Practices

1. **Consistent Log Levels**: Use appropriate log levels consistently:

```typescript
// Debug: Detailed information for debugging
logger.debug('Processing item 5 of 27');

// Info: Noteworthy events, regular operations
logger.info('User logged in');

// Warn: Concerning events that might need attention
logger.warn('API rate limit at 80%');

// Error: Error conditions requiring immediate attention
logger.error('Database connection failed');
```

2. **Structured Metadata**: Use consistent metadata keys and structures:

```typescript
// Good: Consistent metadata structure
logger.info('User action', {
  userId: '123',
  action: 'purchase',
  itemId: 'item-456',
  amount: 49.99,
});

// Bad: Inconsistent or flat strings
logger.info('User 123 purchased item-456 for $49.99');
```

3. **Error Handling**: Properly capture error details:

```typescript
try {
  await someOperation();
} catch (error) {
  logger.error('Operation failed', {
    operation: 'someOperation',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    // Additional context
    userId: user.id,
  });
}
```

4. **Sensitive Data**: Never log sensitive information:

```typescript
// Good: Omit sensitive data
logger.info('User authenticated', {
  userId: user.id,
  // Don't include: password, tokens, etc.
});

// Good: Redact sensitive fields
logger.info('Payment processed', {
  userId: user.id,
  cardNumber: 'XXXX-XXXX-XXXX-1234', // Last 4 only
  amount: payment.amount,
});
```

5. **Sampling and Filtering**: For high-volume logs, consider sampling:

```typescript
// Only log a percentage of high-volume events
if (Math.random() < 0.01) { // 1% sample
  logger.debug('Cache hit', { key, hitCount });
}
```

## Custom Implementations

You can create your own logger implementation by extending the `AbstractLogger` class:

```typescript
import { AbstractLogger, LogLevel } from '../services/logging/abstract-logger';

export class MyCustomLogger extends AbstractLogger {
  constructor(private options: { serviceName: string }) {
    super();
  }
  
  log(message: string, level: LogLevel, metadata?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const formattedMetadata = metadata ? JSON.stringify(metadata) : '';
    
    // Implement your logging logic
    console.log(`[${timestamp}] [${this.options.serviceName}] [${level.toUpperCase()}] ${message} ${formattedMetadata}`);
    
    // Could also send to a logging service, file, etc.
  }
}
```

## Environment-Specific Loggers

You might want different logging behavior in different environments:

```typescript
import { AbstractLogger } from '../services/logging/abstract-logger';
import { AxiomLogger } from '../services/logging/axiom-logger';

// Create the appropriate logger based on environment
export function createLogger(): AbstractLogger {
  if (process.env.NODE_ENV === 'production') {
    // Production: Use Axiom
    return new AxiomLogger({
      token: process.env.AXIOM_TOKEN!,
      dataset: 'production-logs',
    });
  } else if (process.env.NODE_ENV === 'staging') {
    // Staging: Use Axiom with different dataset
    return new AxiomLogger({
      token: process.env.AXIOM_TOKEN!,
      dataset: 'staging-logs',
    });
  } else {
    // Development: Use console or other simple logger
    return new MyCustomLogger({ serviceName: 'development' });
  }
}
```
