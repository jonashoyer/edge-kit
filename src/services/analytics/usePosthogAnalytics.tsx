import { Properties } from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { AbstractAnalytics } from "./abstractAnalytics";

export interface AnalyticsEvents {
  action: {
    userId: string;
    timestamp: number;
  };
}

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
      posthog.identify(newDistinctId, userPropertiesToSet, userPropertiesToSetOnce);
    },
    reset() {
      posthog.reset();
    }
  } satisfies AbstractAnalytics<AnalyticsEvents>;
};