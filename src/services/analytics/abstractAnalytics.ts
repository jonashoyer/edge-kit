type AnalyticsProperty = any;
type AnalyticsProperties = Record<string, AnalyticsProperty>;

export abstract class AbstractAnalytics<T extends Record<string, AnalyticsProperties>> {
  abstract capture<TEvent extends keyof T>(event: TEvent, properties: T[TEvent]): void;

  abstract identify(
    distinctId?: string,
  ): void;

  abstract reset(): void;
}