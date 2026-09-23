import { PostHog, type PostHogOptions } from 'posthog-node';

import type { AbstractServerSideAnalytics } from './abstract-analytics';

export class PosthogServerSideAnalytics<
  T extends Record<string, Record<string, unknown>>,
> implements AbstractServerSideAnalytics<T>
{
  posthog: PostHog;

  constructor(token: string, config?: PostHogOptions) {
    this.posthog = new PostHog(token, {
      flushAt: 1,
      flushInterval: 0,
      host: config?.host ?? 'https://eu.i.posthog.com',
      ...config,
    });
  }

  capture<TEvent extends keyof T>(
    event: TEvent,
    properties: T[TEvent],
    distinctId: string
  ): void {
    this.posthog.capture({ distinctId, event: event as string, properties });
  }

  async shutdown() {
    await this.posthog.shutdown();
  }
}

// TRPC analytics middleware
// const analyticsMiddleware = t.middleware(async (opts) => {
//   const result = await opts.next();
//   waitUntil(opts.ctx.analytics.shutdown());
//   return result;
// });
