import {
  SleeperApiError,
  SleeperNetworkError,
  SleeperParseError,
  SleeperTimeoutError,
  parseRetryAfterMs,
} from './errors.js';
import { MAX_TIMER_MS, assertMs, assertOptions, parseJson } from './util.js';
import type { FetchFunction, RequestOptions } from './types.js';

/** Transport settings, validated once in the constructor. */
export interface HttpClientOptions {
  baseUrl: string;
  rateLimitMs?: number;
  timeoutMs?: number;
  fetch?: FetchFunction;
  headers?: Record<string, string>;
}

/** One GET request, as the namespaces describe it. */
export interface GetRequest {
  /** Query parameters; values are converted with `String()`. */
  query?: Record<string, string | number>;
  /** The caller's `signal` and `timeoutMs`. */
  request?: RequestOptions;
  /**
   * What a `200` with a `null` body means: `'notFound'` (the default) throws a
   * `404` {@link SleeperApiError}; `'empty'` resolves to `[]` for endpoints
   * where `null` means "nothing yet" (a league with no playoff bracket).
   */
  onNull?: 'notFound' | 'empty';
}

/** Wait `ms`, rejecting with `signal.reason` (and clearing the timer) if it aborts. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      Math.min(ms, MAX_TIMER_MS),
    );
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The HTTP transport behind every namespace. Not part of the public API. */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly rateLimitMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchFunction | undefined;
  private readonly headers: Record<string, string> | undefined;
  /** Earliest time (monotonic clock) the next request may start. */
  private nextSlotAt = 0;

  constructor(options: HttpClientOptions) {
    const { baseUrl, rateLimitMs = 0, timeoutMs = 0, fetch, headers } = options;
    assertMs('rateLimitMs', rateLimitMs, false);
    assertMs('timeoutMs', timeoutMs, true);
    if (fetch !== undefined && typeof fetch !== 'function') {
      throw new TypeError('fetch must be a function');
    }
    assertOptions('headers', headers);
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.rateLimitMs = rateLimitMs;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetch;
    this.headers = headers === undefined ? undefined : { ...headers };
  }

  /**
   * Send a GET request.
   *
   * Order of events: wait for this call's rate-limit slot (cancellable through
   * `request.signal`), then start the timeout, then `fetch` with an abort
   * signal and read the body. The timeout therefore covers dispatch to parsed
   * body, never time spent waiting for a slot.
   */
  async get<T>(path: string, options: GetRequest = {}): Promise<T> {
    const { query, request, onNull } = options;
    assertOptions('request options', request);
    const signal = request?.signal;
    const timeoutMs = request?.timeoutMs ?? this.timeoutMs;
    assertMs('timeoutMs', timeoutMs, true);
    signal?.throwIfAborted();

    await this.waitForSlot(signal);
    signal?.throwIfAborted();

    const url = this.urlFor(path, query);
    // A budget beyond what a timer can hold is no budget at all.
    const effectiveTimeoutMs = timeoutMs > MAX_TIMER_MS ? 0 : timeoutMs;

    const controller = new AbortController();
    let timeoutError: SleeperTimeoutError | undefined;
    const onCallerAbort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer =
      effectiveTimeoutMs > 0
        ? setTimeout(() => {
            // The caller already aborted; their reason wins.
            if (controller.signal.aborted) return;
            const reason = new DOMException(
              `Timed out after ${effectiveTimeoutMs} ms`,
              'TimeoutError',
            );
            timeoutError = new SleeperTimeoutError(url, effectiveTimeoutMs, { cause: reason });
            controller.abort(reason);
          }, effectiveTimeoutMs)
        : undefined;

    try {
      return await this.send<T>(url, controller.signal, onNull);
    } catch (error) {
      // A status that arrived before the timeout or abort (e.g. a 429 whose
      // body read was cut off) is more useful than the abort itself.
      if (error instanceof SleeperApiError) throw error;
      if (timeoutError) throw timeoutError;
      if (signal?.aborted) throw signal.reason;
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  /**
   * Space requests `rateLimitMs` apart. Each call reserves the next free slot
   * when it is made, so calls start in the order they were made. A call
   * aborted while waiting rejects at once, but its slot stays used.
   */
  private async waitForSlot(signal: AbortSignal | undefined): Promise<void> {
    if (this.rateLimitMs === 0) return;
    // performance.now() is monotonic, so a wall-clock change cannot stall calls.
    const now = performance.now();
    const at = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = at + this.rateLimitMs;
    if (at > now) await sleep(at - now, signal);
  }

  private async send<T>(
    url: string,
    signal: AbortSignal,
    onNull: GetRequest['onNull'],
  ): Promise<T> {
    // Read the global at call time, so a fetch stubbed after construction is used.
    const fetchImpl = this.fetchImpl ?? globalThis.fetch;
    const init: RequestInit = this.headers ? { signal, headers: this.headers } : { signal };
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      throw new SleeperNetworkError(`Failed to fetch ${url}`, { cause: error, url });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => undefined);
      throw new SleeperApiError(response.status, response.statusText, url, body, {
        headers: response.headers,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new SleeperNetworkError(`Failed to read response body from ${url}`, {
        cause: error,
        url,
      });
    }

    let data: unknown;
    try {
      data = parseJson(text);
    } catch (error) {
      throw new SleeperParseError(url, text, { cause: error });
    }

    if (data === null) {
      if (onNull === 'empty') return [] as T;
      throw new SleeperApiError(404, 'Not Found', url, text, { headers: response.headers });
    }
    return data as T;
  }

  /** The full request URL for a path and query. */
  private urlFor(path: string, query?: Record<string, string | number>): string {
    let url = this.baseUrl + path;
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        params.set(key, String(value));
      }
      url += `?${params.toString()}`;
    }
    return url;
  }
}
