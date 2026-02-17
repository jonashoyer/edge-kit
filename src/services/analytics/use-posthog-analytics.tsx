import type { Properties } from 'posthog-js';
import { usePostHog } from 'posthog-js/react';

import type { AbstractAnalytics } from './abstract-analytics';
import type { AnalyticsEvents } from './analytics-events';

export const useAnalytics = () => {
  const posthog = usePostHog();

  return {
    capture<TEvent extends keyof AnalyticsEvents>(
      event: TEvent,
      properties: AnalyticsEvents[TEvent]
    ) {
      posthog.capture(event as string, properties);
    },
    identify(
      newDistinctId?: string,
      userPropertiesToSet?: Properties,
      userPropertiesToSetOnce?: Properties
    ) {
      posthog.identify(
        newDistinctId,
        userPropertiesToSet,
        userPropertiesToSetOnce
      );
    },
    reset() {
      posthog.reset();
    },
  } satisfies AbstractAnalytics<AnalyticsEvents>;
};
