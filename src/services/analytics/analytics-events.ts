/**
 * Example type definition for analytics events.
 * Users should define their own event map matching this structure.
 */
export type AnalyticsEvents = {
  example_action: {
    userId: string;
    timestamp: number;
  };
};
