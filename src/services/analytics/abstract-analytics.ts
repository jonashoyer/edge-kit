export type AnalyticsProperty = unknown;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

type BaseAbstractAnalytics<
  T extends Record<K, AnalyticsProperties>,
  K extends keyof T = keyof T,
> = object;

/**
 * Abstract interfaces for client-side and server-side analytics services.
 * Defines methods for capturing events, identifying users, and managing sessions.
 * Generic over an event map T to ensure type-safe event names and properties.
 */
export interface AbstractAnalytics<
  T extends Record<K, AnalyticsProperties>,
  K extends keyof T = keyof T,
> extends BaseAbstractAnalytics<T, K> {
  capture<TEvent extends K>(event: TEvent, properties: T[TEvent]): void;

  identify(distinctId?: string): void;

  reset(): void;
}

export interface AbstractServerSideAnalytics<
  T extends Record<K, AnalyticsProperties>,
  K extends keyof T = keyof T,
> extends BaseAbstractAnalytics<T, K> {
  capture<TEvent extends K>(
    event: TEvent,
    properties: T[TEvent],
    distinctId: string
  ): void;

  shutdown(): Promise<void>;
}
