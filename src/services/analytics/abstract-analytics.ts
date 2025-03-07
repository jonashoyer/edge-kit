export type AnalyticsProperty = any;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;


interface BaseAbstractAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T> { }

export interface AbstractAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T> extends BaseAbstractAnalytics<T, K> {
  capture<TEvent extends K>(event: TEvent, properties: T[TEvent]): void;

  identify(
    distinctId?: string,
  ): void;

  reset(): void;
}

export interface AbstractServerSideAnalytics<T extends Record<K, AnalyticsProperties>, K extends keyof T = keyof T> extends BaseAbstractAnalytics<T, K> {
  capture<TEvent extends K>(event: TEvent, properties: T[TEvent], distinctId: string): void;

  shutdown(): Promise<void>;
}