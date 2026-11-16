import { getEventListeners } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../http.js';
import { SleeperClient } from '../client.js';
import { SleeperApiError, SleeperNetworkError, SleeperTimeoutError } from '../errors.js';
import { BASE, settle, slowFetch, stubFetch, textResponse } from './helpers.js';

describe('timeouts and cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts the fetch and throws SleeperTimeoutError when timeoutMs elapses', async () => {
    const fetchMock = slowFetch(5_000);
    const client = new HttpClient({ baseUrl: BASE, timeoutMs: 1_000 });

    const call = settle(client.get('/state/nfl'));
    await vi.advanceTimersByTimeAsync(1_000);

    const error = await call.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SleeperTimeoutError);
    expect(error).toBeInstanceOf(SleeperNetworkError);
    expect(error).toMatchObject({ timeoutMs: 1_000, url: `${BASE}/state/nfl` });
    expect((error as Error).cause).toMatchObject({ name: 'TimeoutError' });

    const init = fetchMock.mock.calls[0][1] as { signal: AbortSignal };
    expect(init.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves normally and clears its timer when the response beats the timeout', async () => {
    slowFetch(500);
    const client = new HttpClient({ baseUrl: BASE, timeoutMs: 1_000 });

    const call = client.get('/state/nfl');
    await vi.advanceTimersByTimeAsync(500);

    await expect(call).resolves.toEqual({ ok: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets a per-call timeoutMs override the client default, and 0 disable it', async () => {
    slowFetch(2_000);
    const client = new HttpClient({ baseUrl: BASE, timeoutMs: 1_000 });

    const shorter = settle(client.get('/a', { request: { timeoutMs: 100 } }));
    const disabled = client.get('/b', { request: { timeoutMs: 0 } });

    await vi.advanceTimersByTimeAsync(100);
    await expect(shorter).rejects.toMatchObject({ name: 'SleeperTimeoutError', timeoutMs: 100 });

    await vi.advanceTimersByTimeAsync(1_900);
    await expect(disabled).resolves.toEqual({ ok: 1 });
  });

  it('rejects with the caller signal reason when the caller aborts mid-request', async () => {
    const fetchMock = slowFetch(5_000);
    const client = new HttpClient({ baseUrl: BASE, timeoutMs: 10_000 });
    const controller = new AbortController();

    const call = settle(client.get('/state/nfl', { request: { signal: controller.signal } }));
    await vi.advanceTimersByTimeAsync(200);
    controller.abort();

    const error = await call.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(error).not.toBeInstanceOf(SleeperTimeoutError);
    const init = fetchMock.mock.calls[0][1] as { signal: AbortSignal };
    expect(init.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not fetch at all when the signal is already aborted', async () => {
    const fetchMock = slowFetch(10);
    const controller = new AbortController();
    controller.abort(new Error('gave up'));

    await expect(
      new HttpClient({ baseUrl: BASE }).get('/x', { request: { signal: controller.signal } }),
    ).rejects.toThrow('gave up');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts the timeout at dispatch, not while waiting for a throttle slot', async () => {
    // 5 concurrent calls, 400 ms spacing, 700 ms responses, 1 s budget. If the
    // budget counted queue time, calls 3-5 (queued 800-1600 ms) would time out.
    const dispatchedAt: number[] = [];
    slowFetch(700, dispatchedAt);
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 400, timeoutMs: 1_000 });
    const start = Date.now();

    const calls = Array.from({ length: 5 }, (_, i) => settle(client.get(`/n/${i}`)));
    await vi.advanceTimersByTimeAsync(1_600 + 700);

    const results = await Promise.allSettled(calls);
    expect(results.map((r) => r.status)).toEqual(Array(5).fill('fulfilled'));
    expect(dispatchedAt.map((t) => t - start)).toEqual([0, 400, 800, 1_200, 1_600]);
  });

  it('rejects a call aborted while waiting at once, without delaying the others', async () => {
    const dispatchedAt: number[] = [];
    const fetchMock = stubFetch(undefined, dispatchedAt);
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 1_000 });
    const start = Date.now();
    const controller = new AbortController();

    const a = client.get('/a');
    const b = settle(client.get('/b', { request: { signal: controller.signal } }));
    const c = client.get('/c');

    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(1_500);
    await Promise.all([a, c]);
    // B's slot (1000 ms) stays used; C keeps its own slot at 2000 ms.
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([`${BASE}/a`, `${BASE}/c`]);
    expect(dispatchedAt.map((t) => t - start)).toEqual([0, 2_000]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the throttle timer when the last queued call aborts', async () => {
    stubFetch();
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 3_000 });
    await client.get('/a');

    const controller = new AbortController();
    const b = settle(client.get('/b', { request: { signal: controller.signal } }));
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });

    // Nothing is left to keep the process alive.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no abort listeners on a long-lived caller signal', async () => {
    slowFetch(10);
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 100, timeoutMs: 1_000 });
    const { signal } = new AbortController();

    const calls = [1, 2, 3].map((n) => client.get(`/${n}`, { request: { signal } }));
    // Queued calls (and the one in flight) listen while they wait.
    expect(getEventListeners(signal, 'abort').length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all(calls);

    expect(getEventListeners(signal, 'abort')).toHaveLength(0);
  });

  it('releases queued calls in FIFO order', async () => {
    const fetchMock = stubFetch();
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 100 });
    const calls = ['/a', '/b', '/c', '/d'].map((p) => client.get(p));
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all(calls);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(
      ['/a', '/b', '/c', '/d'].map((p) => `${BASE}${p}`),
    );
  });

  it('keeps spacing calls when the wall clock jumps backwards', async () => {
    const fetchMock = stubFetch();
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 1_000 });
    const calls = [client.get('/a'), client.get('/b')];
    // Move the wall clock back a day; the monotonic clock is unaffected.
    vi.setSystemTime(Date.now() - 86_400_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all(calls);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps spacing calls rateLimitMs apart', async () => {
    const dispatchedAt: number[] = [];
    slowFetch(0, dispatchedAt);
    const client = new HttpClient({ baseUrl: BASE, rateLimitMs: 250 });
    const start = Date.now();

    const calls = [client.get('/1'), client.get('/2'), client.get('/3')];
    await vi.advanceTimersByTimeAsync(501);
    await Promise.all(calls);

    expect(dispatchedAt.map((t) => t - start)).toEqual([0, 250, 500]);
  });

  it('passes per-call options through the namespace methods', async () => {
    const fetchMock = slowFetch(5_000);
    const client = new SleeperClient({ timeoutMs: 60_000 });

    const call = settle(client.leagues.getMatchups('123', 3, { timeoutMs: 50 }));
    const trending = settle(client.players.getTrending('add', { limit: 5, timeoutMs: 50 }));
    await vi.advanceTimersByTimeAsync(50);

    await expect(call).rejects.toBeInstanceOf(SleeperTimeoutError);
    await expect(trending).rejects.toBeInstanceOf(SleeperTimeoutError);
    expect(fetchMock.mock.calls[1][0]).toContain('limit=5');
  });

  it('applies the client-level timeoutMs from SleeperClientOptions', async () => {
    slowFetch(5_000);
    const client = new SleeperClient({ timeoutMs: 300 });

    const call = settle(client.state.get());
    await vi.advanceTimersByTimeAsync(300);

    await expect(call).rejects.toBeInstanceOf(SleeperTimeoutError);
  });
});

describe('Retry-After', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function errorResponse(status: number, headers: Record<string, string> = {}) {
    return () => textResponse('', { status, statusText: 'Too Many Requests', headers });
  }

  it('exposes delta-seconds Retry-After as retryAfterMs', async () => {
    stubFetch(errorResponse(429, { 'Retry-After': '120' }));

    const error = await new HttpClient({ baseUrl: BASE }).get('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SleeperApiError);
    expect((error as SleeperApiError).retryAfterMs).toBe(120_000);
    expect((error as SleeperApiError).headers?.get('retry-after')).toBe('120');
  });

  it('exposes an HTTP-date Retry-After relative to now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    stubFetch(errorResponse(503, { 'Retry-After': 'Tue, 01 Sep 2026 12:00:30 GMT' }));

    const error = (await new HttpClient({ baseUrl: BASE })
      .get('/x')
      .catch((e: unknown) => e)) as SleeperApiError;

    expect(error.retryAfterMs).toBe(30_000);
  });

  it('leaves retryAfterMs undefined without the header', async () => {
    stubFetch(errorResponse(429));
    const error = (await new HttpClient({ baseUrl: BASE })
      .get('/x')
      .catch((e: unknown) => e)) as SleeperApiError;
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.headers).toBeInstanceOf(Headers);
  });
});
