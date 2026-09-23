/**
 * Time-based request throttler for external APIs.
 *
 * `new Throttler(rpm)` keeps the original rolling-window RPM behavior. Passing
 * an options object can additionally serialize calls with a minimum spacing so
 * bursty callers stay near an API's advertised average rate.
 */
export class Throttler {
  private readonly enabled: boolean;
  private readonly minimumIntervalMs: number;
  private readonly requestsPerMinute: number | null;
  private readonly requestTimes: number[] = [];
  private nextSlot: Promise<void> = Promise.resolve();
  private lastStartedAt: number | undefined;

  constructor(requestsPerMinute: number);
  constructor(options: {
    enabled?: boolean;
    minimumIntervalMs?: number;
    requestsPerMinute?: number;
  });
  constructor(
    options:
      | number
      | {
          enabled?: boolean;
          minimumIntervalMs?: number;
          requestsPerMinute?: number;
        }
  ) {
    const normalized =
      typeof options === 'number' ? { requestsPerMinute: options } : options;

    this.enabled = normalized.enabled ?? true;
    this.minimumIntervalMs = normalized.minimumIntervalMs ?? 0;
    this.requestsPerMinute = normalized.requestsPerMinute ?? null;

    validateNonNegativeInteger(
      this.minimumIntervalMs,
      'minimumIntervalMs must be a non-negative integer'
    );

    if (this.requestsPerMinute !== null) {
      validatePositiveNumber(
        this.requestsPerMinute,
        'requestsPerMinute must be a positive number'
      );
    }
  }

  /**
   * Wait until a slot is available based on the configured pacing policy.
   */
  async waitForSlot(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const previous = this.nextSlot;
    const next = previous.then(() => this.waitForAvailableSlot());

    this.nextSlot = next.catch(() => {
      // Keep the internal queue usable after an unexpected failure.
    });

    await next;
  }

  private async waitForAvailableSlot(): Promise<void> {
    await this.waitForRollingWindowSlot();
    await this.waitForMinimumSpacing();
    this.recordStart();
  }

  private async waitForRollingWindowSlot(): Promise<void> {
    if (this.requestsPerMinute === null) {
      return;
    }

    while (true) {
      this.pruneOldRequests();
      if (this.requestTimes.length < this.requestsPerMinute) {
        return;
      }

      const oldestRequest = this.requestTimes[0];
      if (oldestRequest === undefined) {
        return;
      }

      const waitTime = oldestRequest + 60_000 - Date.now();
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }
  }

  private async waitForMinimumSpacing(): Promise<void> {
    if (this.minimumIntervalMs === 0 || this.lastStartedAt === undefined) {
      return;
    }

    const nextAllowedAt = this.lastStartedAt + this.minimumIntervalMs;
    const waitTime = nextAllowedAt - Date.now();
    if (waitTime > 0) {
      await sleep(waitTime);
    }
  }

  private pruneOldRequests(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    while (
      this.requestTimes.length > 0 &&
      this.requestTimes[0] !== undefined &&
      this.requestTimes[0] <= oneMinuteAgo
    ) {
      this.requestTimes.shift();
    }
  }

  private recordStart(): void {
    const now = Date.now();
    this.lastStartedAt = now;
    if (this.requestsPerMinute !== null) {
      this.requestTimes.push(now);
    }
  }
}

const validatePositiveNumber = (value: number, message: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
};

const validateNonNegativeInteger = (value: number, message: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
