# Notification Services

## Overview

- Abstract notification interface with pluggable providers
- Slack provider using bot token API (`chat.postMessage`)
- Optional logger integration
- Resilient HTTP via `fetchExt` with retries/backoff
- Multi-channel support via payload override

## Abstract Interface

```ts
import type { AbstractLogger } from "../../src/services/logging/abstract-logger";

export interface TextNotification {
  text: string;
  channel?: string;
}
export interface BlockNotification {
  blocks: any[];
  channel?: string;
}
export type NotificationPayload = TextNotification | BlockNotification;

export interface NotificationResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message?: unknown;
}

export abstract class AbstractNotificationService {
  constructor(protected logger?: AbstractLogger) {}
  abstract send(payload: NotificationPayload): Promise<NotificationResponse>;
}
```

## Slack Implementation

Location: `src/services/notification/slack-notification.ts`

### Constructor

```ts
new SlackNotificationService(botToken: string, defaultChannelId: string, logger?: AbstractLogger, options?: {
  timeoutMs?: number; retries?: number; retryDelay?: number;
})
```

### Usage

```ts
import { SlackNotificationService } from "../../src/services/notification";

const slack = new SlackNotificationService(
  process.env.SLACK_BOT_TOKEN!,
  "C1234567890"
);

// Text
await slack.send({ text: "Deployed v42" });

// Text to another channel
await slack.send({ text: "to #ops", channel: "COPS123" });

// Blocks
await slack.send({
  channel: "C1234567890",
  blocks: [
    slack.createSection("*Release* v42 is live"),
    slack.createDivider(),
    {
      type: "actions",
      elements: [slack.createButton("View logs", "https://example.com")],
    },
  ],
});

// Helper
await slack.sendText("build #%s finished in %dms", "8421", 973);
```

### Notes

- Returns Slack metadata `{ ok, channel, ts, message }`
- Errors on HTTP failure or `{ ok: false }`
- Uses `fetchExt` for timeout/retry
