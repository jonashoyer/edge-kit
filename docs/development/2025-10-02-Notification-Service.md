# Feature: Notification Service

## 1. Codebase-First Analysis

### Existing Code Search

- `AbstractAlertingService` pattern: abstract base class with severity-based alerts
- `SlackAlertingService`: webhook-based, structured for alerts
- `AbstractLogger`: simple abstract pattern, multiple methods
- `AbstractKeyValueService`: comprehensive abstract pattern
- `fetchExt` utility: timeout, retry, backoff support
- Provided `SlackService` (tmp): bot token API, supports text/blocks

### Reusable Scaffolding

- Abstract service pattern: constructor DI, abstract methods, protected helpers
- `fetchExt`: HTTP requests with resilience
- Slack API patterns: timeout, abort controller, error handling
- Constructor injection: credentials, config

### Differentiation from Alerting

- Alerting: severity-based critical events, monitoring focus
- Notification: general purpose messaging, user-facing updates
- Alerting: structured alert options (severity, source, tags)
- Notification: flexible payload (text, blocks, rich formatting)

## 2. Specifications

### User Stories

- Developer: send text notifications via Slack
- Developer: send rich block-based messages
- Developer: swap notification providers without code changes
- Developer: handle timeouts and errors gracefully
- System: retry failed notifications with backoff

### Technical Approach

- Abstract class: `AbstractNotificationService`
- First implementation: `SlackNotificationService` using bot token API
- Support both simple text and block-based payloads
- Use `fetchExt` for resilient HTTP calls
- Constructor DI: credentials, config, optional logger
- Error handling: timeout, validation, API errors

### Interface Design

```typescript
// Notification payload types
interface TextNotification {
  text: string;
  channel?: string; // Override default channel
}

interface BlockNotification {
  blocks: any[];
  channel?: string;
}

interface NotificationResponse {
  ok: boolean;
  channel: string;
  ts: string; // Message timestamp
  message?: any;
}

// Abstract service
abstract class AbstractNotificationService {
  constructor(protected logger?: AbstractLogger);
  abstract send(payload: TextNotification | BlockNotification): Promise<NotificationResponse>;
}

// Slack implementation
class SlackNotificationService extends AbstractNotificationService {
  constructor(botToken: string, defaultChannelId: string, logger?: AbstractLogger, timeout?: number);
  send(payload): Promise<NotificationResponse>;
  sendText(message: string, ...args): Promise<NotificationResponse>; // Helper with format
  // Formatting helpers
  createButton(text: string, url: string): BlockElement;
  createSection(text: string): Block;
  createDivider(): Block;
}
```

## 3. Development Steps

1. Create `src/services/notification/` directory
2. Implement `abstract-notification.ts`:
   - Define `NotificationPayload` types (text, blocks) with optional `channel` override
   - Define `NotificationResponse` interface (ok, channel, ts, message)
   - Define `AbstractNotificationService` base class
   - Constructor: optional `AbstractLogger`
   - Abstract method: `send(payload): Promise<NotificationResponse>`
3. Implement `slack-notification.ts`:
   - Extend `AbstractNotificationService`
   - Constructor: `botToken`, `defaultChannelId`, optional `logger`, optional `timeout`
   - `send()` method:
     - Use `fetchExt` with retry for resilience
     - POST to `https://slack.com/api/chat.postMessage`
     - Support channel override via payload
     - Return full response with metadata
   - Handle both text and blocks payloads
   - Error handling: timeout, HTTP errors, Slack API errors
   - Optional logging of send operations
   - Helper: `sendText(message, ...args)` - format with `util.format`
   - Formatting helpers:
     - `createButton(text, url)`: button block element
     - `createSection(text)`: section block
     - `createDivider()`: divider block
4. Create documentation: `docs/services/notification.md`
   - Overview and use cases
   - Abstract interface
   - Slack implementation with examples
   - Formatting helpers examples
   - Multi-channel usage pattern

---

## Decisions Made

- **Logger**: Optional `AbstractLogger` for tracking
- **Rate limiting**: Use `fetchExt` retry mechanism (basic)
- **Formatting helpers**: Include common Slack block helpers
- **Delivery confirmation**: Return `NotificationResponse` with metadata
- **Multi-channel**: Support via optional `channel` in payload (flexible)
- **API approach**: Bot token only (no webhook support)
