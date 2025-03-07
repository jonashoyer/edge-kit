import { PostHog, PostHogOptions } from 'posthog-node';
import { AbstractServerSideAnalytics } from './abstract-analytics';

export class PosthogServerSideAnalytics<T extends Record<string, Record<string, any>>> implements AbstractServerSideAnalytics<T> {

  public posthog: PostHog;

  constructor(token: string, config?: PostHogOptions) {
    this.posthog = new PostHog(token, { host: config?.host ?? 'https://eu.i.posthog.com', flushAt: 1, flushInterval: 0, ...config });
  }

  public capture<TEvent extends keyof T>(
    event: TEvent,
    properties: T[TEvent],
    distinctId: string,
  ): void {
    this.posthog.capture({ event: event as string, distinctId, properties });
  }

  public async shutdown() {
    await this.posthog.shutdown();
  }
}

// TRPC analytics middleware
// const analyticsMiddleware = t.middleware(async (opts) => {
//   const result = await opts.next();
//   waitUntil(opts.ctx.analytics.shutdown());
//   return result;
// });
