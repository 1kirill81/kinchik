import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/lib/rateLimit';

describe('In-Memory Rate Limiter', () => {
  it('allows requests within the limit and blocks exceeding attempts', () => {
    const key = `test-ip-${Date.now()}`;
    const limit = 3;
    const windowMs = 5000;

    const r1 = checkRateLimit(key, limit, windowMs);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, limit, windowMs);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, limit, windowMs);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = checkRateLimit(key, limit, windowMs);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });
});
