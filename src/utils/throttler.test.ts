import { afterEach, describe, expect, it, vi } from 'vitest';
import { Throttler } from './throttler';

afterEach(() => vi.useRealTimers());

describe('Throttler admission', () => {
  it('releases queued RPM slots at the exact window boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const throttler = new Throttler(1);
    await throttler.waitForSlot();
    const next = vi.fn();
    const pending = throttler.waitForSlot().then(next);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(next).toHaveBeenCalledOnce();
  });

  it('spaces concurrent starts even when the first admission is at epoch zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const throttler = new Throttler({
      minimumIntervalMs: 20,
      requestsPerMinute: 2,
    });
    const starts: number[] = [];
    const tasks = Promise.all(
      [1, 2, 3].map(async () => {
        await throttler.waitForSlot();
        starts.push(Date.now());
      })
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await tasks;
    expect(starts).toEqual([0, 20, 60_000]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid RPM %s',
    (rpm) => {
      expect(() => new Throttler(rpm)).toThrow('requestsPerMinute');
    }
  );

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid spacing %s',
    (minimumIntervalMs) => {
      expect(() => new Throttler({ minimumIntervalMs })).toThrow(
        'minimumIntervalMs'
      );
    }
  );
});
