/**
 * Simple time-window throttler that caps requests per minute.
 * Useful for external APIs with fixed RPM limits.
 */
export class Throttler {
  private readonly requestsPerMinute: number;
  private readonly requestTimes: number[] = [];

  constructor(requestsPerMinute: number) {
    this.requestsPerMinute = requestsPerMinute;
  }

  /**
   * Wait until a slot is available based on the configured RPM limit.
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    while (
      this.requestTimes.length > 0 &&
      this.requestTimes[0]! < oneMinuteAgo
    ) {
      this.requestTimes.shift();
    }

    if (this.requestTimes.length >= this.requestsPerMinute) {
      const oldestRequest = this.requestTimes[0]!;
      const waitTime = oldestRequest + 60_000 - now;
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.waitForSlot();
      }
    }

    this.requestTimes.push(Date.now());
  }
}
