import { describe, it, expect, vi } from 'vitest';
import { fetchWithTimeout, fetchWithRetry } from '@/lib/http';

describe('HTTP Resilience Utilities', () => {
  it('throws TimeoutError when upstream takes longer than timeoutMs', async () => {
    // Mock slow fetch
    const slowFetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'TimeoutError'));
        });
      });
    });

    vi.stubGlobal('fetch', slowFetch);

    await expect(
      fetchWithTimeout('https://slow-api.example.com', {}, 50)
    ).rejects.toThrow();

    vi.unstubAllGlobals();
  });

  it('retries idempotent GET on 500 server error', async () => {
    let callCount = 0;
    const flakeyFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Server Error', { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', flakeyFetch);

    const res = await fetchWithRetry(
      'https://api.example.com/data',
      { method: 'GET' },
      { maxRetries: 2, timeoutMs: 1000, backoffMs: 20 }
    );

    expect(res.status).toBe(200);
    expect(callCount).toBe(2);

    vi.unstubAllGlobals();
  });

  it('does NOT retry non-idempotent POST requests on error', async () => {
    let callCount = 0;
    const postFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response('Server Error', { status: 500 });
    });

    vi.stubGlobal('fetch', postFetch);

    const res = await fetchWithRetry(
      'https://api.example.com/create',
      { method: 'POST', body: JSON.stringify({ a: 1 }) },
      { maxRetries: 2, timeoutMs: 1000, backoffMs: 20 }
    );

    expect(res.status).toBe(500);
    expect(callCount).toBe(1);

    vi.unstubAllGlobals();
  });
});
