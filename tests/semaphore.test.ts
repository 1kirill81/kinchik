import { describe, it, expect } from 'vitest';
import { Semaphore } from '@/lib/semaphore';

describe('Semaphore Concurrency Control', () => {
  it('enforces maximum concurrency and tracks capacity', async () => {
    const sem = new Semaphore(2);
    expect(sem.available).toBe(2);

    const release1 = sem.tryAcquire();
    expect(release1).toBeTypeOf('function');
    expect(sem.available).toBe(1);

    const release2 = sem.tryAcquire();
    expect(release2).toBeTypeOf('function');
    expect(sem.available).toBe(0);

    // Third immediate acquire must fail
    const release3 = sem.tryAcquire();
    expect(release3).toBeNull();

    // Release permit 1
    release1!();
    expect(sem.available).toBe(1);

    // Permit can be acquired again
    const release4 = sem.tryAcquire();
    expect(release4).toBeTypeOf('function');
    expect(sem.available).toBe(0);

    release2!();
    release4!();
    expect(sem.available).toBe(2);
  });

  it('guarantees release idempotency without double-incrementing capacity', () => {
    const sem = new Semaphore(2);
    const release = sem.tryAcquire();
    expect(sem.available).toBe(1);

    // Double release
    release!();
    release!();
    release!();

    expect(sem.available).toBe(2);
    expect(sem.active).toBe(0);
  });

  it('queues async waiters and awakens them upon release', async () => {
    const sem = new Semaphore(1);
    const release1 = sem.tryAcquire();

    let secondWorkerFinished = false;
    const workerPromise = sem.acquire(2000).then((releaseWorker) => {
      secondWorkerFinished = true;
      releaseWorker();
    });

    expect(secondWorkerFinished).toBe(false);
    release1!();
    await workerPromise;
    expect(secondWorkerFinished).toBe(true);
    expect(sem.available).toBe(1);
  });
});
