export type AnalyticsProperty = any;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

export interface AbstractAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T> {
  capture<TEvent extends K>(event: TEvent, properties: T[TEvent]): void;

  identify(
    distinctId?: string,
  ): void;

  reset(): void;
}