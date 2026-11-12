/**
 * Thread-safe asynchronous Semaphore with bounded capacity and idempotent release.
 */
export class Semaphore {
  private readonly maxConcurrency: number;
  private currentRunning = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  get active(): number {
    return this.currentRunning;
  }

  get available(): number {
    return Math.max(0, this.maxConcurrency - this.currentRunning);
  }

  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Non-blocking attempt to acquire a permit.
   * Returns a release function if acquired, or null if capacity is reached.
   */
  tryAcquire(): (() => void) | null {
    if (this.currentRunning < this.maxConcurrency) {
      this.currentRunning++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }
    return null;
  }

  /**
   * Acquire a permit, waiting if necessary up to timeoutMs.
   */
  async acquire(timeoutMs = 0): Promise<() => void> {
    const immediate = this.tryAcquire();
    if (immediate) return immediate;

    return new Promise<() => void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const waiter = () => {
        if (timer) clearTimeout(timer);
        this.currentRunning++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = this.queue.indexOf(waiter);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(new Error(`Semaphore acquire timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }

      this.queue.push(waiter);
    });
  }

  private release(): void {
    this.currentRunning = Math.max(0, this.currentRunning - 1);
    if (this.queue.length > 0 && this.currentRunning < this.maxConcurrency) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}
