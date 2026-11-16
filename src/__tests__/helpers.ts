import { vi } from 'vitest';

export const BASE = 'https://api.sleeper.app/v1';

/** A real `Response` with a JSON body. */
export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}

/** A real `Response` with a raw text body. */
export function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

/**
 * Stub the global `fetch` with a mock that answers every call with a fresh
 * response from `respond` (a `Response` body can only be read once), and
 * records the (possibly fake) time of each call in `dispatchedAt`.
 */
export function stubFetch(
  respond: () => Response = () => jsonResponse({}),
  dispatchedAt: number[] = [],
) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
    dispatchedAt.push(Date.now());
    return Promise.resolve(respond());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * A fetch stand-in that answers after `delayMs` of (fake) time and honours
 * its abort signal the way the real one does: it rejects with
 * `signal.reason` as soon as the signal fires.
 */
export function slowFetch(delayMs: number, dispatchedAt: number[] = []) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    dispatchedAt.push(Date.now());
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      const timer = setTimeout(() => resolve(jsonResponse({ ok: 1 })), delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Attach a no-op catch so a rejection before the assertion is not "unhandled". */
export function settle<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

/** Capture a rejection reason (fails if the promise resolves). */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}
