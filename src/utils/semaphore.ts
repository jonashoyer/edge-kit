export class Semaphore {
  private readonly capacity: number;
  private available: number;
  private readonly waitQueue: Array<(release: () => void) => void> = [];

  constructor(maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new Error("Semaphore requires a positive integer capacity");
    }
    this.capacity = maxConcurrency;
    this.available = maxConcurrency;
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.available > 0) {
        this.available -= 1;
        resolve(this.createRelease());
        return;
      }
      this.waitQueue.push(resolve);
    });
  }

  tryAcquire(): (() => void) | null {
    if (this.available > 0) {
      this.available -= 1;
      return this.createRelease();
    }
    return null;
  }

  runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    return this.acquire().then(async (release) => {
      try {
        return await task();
      } finally {
        release();
      }
    });
  }

  getCapacity(): number {
    return this.capacity;
  }

  getAvailable(): number {
    return this.available;
  }

  getPendingCount(): number {
    return this.waitQueue.length;
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waitQueue.shift();
      if (next) {
        next(this.createRelease());
        return;
      }
      // No one waiting; return a permit to the pool
      this.available = Math.min(this.available + 1, this.capacity);
    };
  }
}

export const pLimit = (concurrency: number) => {
  const semaphore = new Semaphore(concurrency);
  const limit = <T>(fn: () => Promise<T> | T): Promise<T> =>
    semaphore.runExclusive(fn);
  return limit;
};

export function mapWithConcurrency<T, R>(
  items: Iterable<T>,
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R> | R
): Promise<R[]> {
  const semaphore = new Semaphore(concurrency);
  const tasks: Promise<R>[] = [];
  let index = 0;
  for (const item of items) {
    const i = index;
    index += 1;
    tasks.push(semaphore.runExclusive(() => mapper(item, i)));
  }
  return Promise.all(tasks);
}

/**
 * Usage Examples
 *
 * // Counting semaphore for critical sections
 * const sem = new Semaphore(2);
 * await Promise.all(items.map((item, i) => sem.runExclusive(() => work(item, i))));
 *
 * // Promise limiter
 * const limit = pLimit(5);
 * await Promise.all(urls.map((u) => limit(() => fetch(u))));
 *
 * // Concurrency-controlled map
 * const results = await mapWithConcurrency(items, 3, async (x, i) => doWork(x, i));
 */
