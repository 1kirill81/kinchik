/**
 * Resilient HTTP client utilities with timeout, retry, backoff, and signal forwarding.
 */

export interface FetchRetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  backoffMs?: number;
}

export class TimeoutError extends Error {
  constructor(message = 'The operation was aborted due to timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Fetch with strict timeout and parent AbortSignal chaining.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const parentSignal = init?.signal;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let onParentAbort: (() => void) | null = null;

  if (parentSignal) {
    if (parentSignal.aborted) {
      throw parentSignal.reason || new DOMException('Aborted', 'AbortError');
    }
    onParentAbort = () => {
      controller.abort(parentSignal.reason);
    };
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError');
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });

  try {
    const fetchPromise = fetch(input, {
      ...init,
      signal: controller.signal,
    });

    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (parentSignal && onParentAbort) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}

/**
 * Fetch with automatic retry and exponential backoff for idempotent requests.
 * Only GET/HEAD requests are retried. Non-idempotent (POST/PUT/DELETE) requests are never retried automatically.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchRetryOptions
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const maxRetries = isIdempotent ? (options?.maxRetries ?? 2) : 0;
  const timeoutMs = options?.timeoutMs ?? 8000;
  const baseBackoff = options?.backoffMs ?? 500;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init, timeoutMs);

      // Handle 429 Too Many Requests with Retry-After header
      if (res.status === 429 && attempt < maxRetries && isIdempotent) {
        const retryAfterHeader = res.headers.get('Retry-After');
        let delayMs = baseBackoff * Math.pow(2, attempt);

        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSec)) {
            delayMs = Math.min(parsedSec * 1000, 10000);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Retry on 5xx server errors for idempotent requests
      if (res.status >= 500 && attempt < maxRetries && isIdempotent) {
        const delayMs = baseBackoff * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return res;
    } catch (err: any) {
      lastError = err;

      // Do not retry if the parent caller explicitly cancelled
      if (init?.signal?.aborted) {
        throw err;
      }

      if (attempt < maxRetries && isIdempotent) {
        const delayMs = baseBackoff * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

/**
 * Fetch for video streams: enforces a timeout ONLY for establishing the connection
 * and receiving headers. Once headers arrive, the stream lifetime is bound to the client.
 */
export async function fetchStreamWithConnectTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  connectTimeoutMs = 10000
): Promise<Response> {
  return fetchWithTimeout(input, init, connectTimeoutMs);
}
