import posthog from 'posthog-js';
import type { PostHogConfig, Properties } from 'posthog-js';

import { AbstractAnalytics } from './abstract-analytics';

export class PosthogAnalytics<T extends Record<string, Record<string, unknown>>> implements AbstractAnalytics<T> {
  constructor(token: string, config?: Partial<PostHogConfig>, name?: string) {
    posthog.init(token, { api_host: config?.api_host ?? 'https://eu.i.posthog.com', ...config }, name);
  }

  public capture<TEvent extends keyof T>(event: TEvent, properties: T[TEvent]): void {
    posthog.capture(event as string, properties);
  }

  public identify(
    newDistinctId?: string,
    userPropertiesToSet?: Properties,
    userPropertiesToSetOnce?: Properties,
    sessionProperties?: Properties,
  ): void {
    if (sessionProperties) {
      posthog.register_for_session(sessionProperties);
    }
    posthog.identify(newDistinctId, userPropertiesToSet, userPropertiesToSetOnce);
  }

  public reset(): void {
    posthog.reset();
  }
}
