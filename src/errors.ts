/** Longest response body kept on an error, in characters. */
export const MAX_ERROR_BODY_LENGTH = 1000;

/**
 * Base class for every error that a request to Sleeper can fail with: HTTP
 * errors, network failures, timeouts and unparseable bodies.
 *
 * Two kinds of failure are deliberately not `SleeperError`s: invalid arguments
 * or options throw a `RangeError`, and a call cancelled through its `signal`
 * rejects with `signal.reason`.
 */
export class SleeperError extends Error {
  /** The full request URL, when the error belongs to a request. */
  readonly url: string | undefined;

  constructor(message: string, options?: { cause?: unknown; url?: string }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'SleeperError';
    this.url = options?.url;
  }
}

/**
 * Thrown when the Sleeper API responds with a non-2xx status code.
 *
 * Sleeper answers some lookups for things that do not exist (for example an
 * unknown username) with `200` and a `null` body. The client reports those as
 * a `404` too, so "not found" always looks the same.
 *
 * @example
 * ```ts
 * try {
 *   await client.users.get('nonexistent');
 * } catch (error) {
 *   if (error instanceof SleeperApiError) {
 *     console.error(error.status); // 404
 *   }
 * }
 * ```
 */
export class SleeperApiError extends SleeperError {
  /** HTTP status code of the response. */
  readonly status: number;
  /** HTTP status text of the response (e.g. `"Not Found"`). */
  readonly statusText: string;
  /** The full request URL that produced the error. */
  declare readonly url: string;
  /** Raw response body (first 1,000 characters), if it could be read. */
  readonly body: string | undefined;
  /**
   * The `Retry-After` response header converted to milliseconds from when
   * the response was received. Both RFC 9110 forms are parsed (delta-seconds
   * and an HTTP-date; a date in the past reads as `0`). `undefined` when the
   * header is absent or unparseable.
   */
  readonly retryAfterMs: number | undefined;
  /** Response headers, when the response exposed them. */
  readonly headers: Headers | undefined;

  constructor(
    status: number,
    statusText: string,
    url: string,
    body?: string,
    options?: SleeperApiErrorOptions,
  ) {
    super(`Sleeper API error: ${status} ${statusText} (${url})`, { url });
    this.name = 'SleeperApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body?.slice(0, MAX_ERROR_BODY_LENGTH);
    this.retryAfterMs = options?.retryAfterMs;
    this.headers = options?.headers;
  }
}

/** Extra details for {@link SleeperApiError}. */
export interface SleeperApiErrorOptions {
  /** Parsed `Retry-After`, in milliseconds. */
  retryAfterMs?: number;
  /** Response headers. */
  headers?: Headers;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** IMF-fixdate, the HTTP-date form servers send: `Sun, 06 Nov 1994 08:49:37 GMT`. */
const IMF_FIXDATE = /^[A-Z][a-z]{2}, (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/** Longest wait `parseRetryAfterMs` reports: about 24.8 days, the largest timer delay. */
const MAX_RETRY_AFTER_MS = 2_147_483_647;

/**
 * Parse an HTTP `Retry-After` header value into milliseconds from `now`.
 *
 * Accepts delta-seconds (`"120"`) and an IMF-fixdate. (RFC 9110 marks the two
 * other date forms obsolete.) Returns `undefined` for anything else, including
 * impossible dates such as 31 February; a date in the past reads as `0`, and
 * waits are capped at 2,147,483,647 ms (about 24.8 days).
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (header === null || header === undefined) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);

  const m = IMF_FIXDATE.exec(trimmed);
  if (!m) return undefined;
  const [day, month, year, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]];
  const monthIndex = MONTHS.indexOf(month);
  if (monthIndex === -1 || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 60) {
    return undefined;
  }
  const at = Date.UTC(+year, monthIndex, +day, +hour, +minute, +second);
  // Date.UTC rolls over (31 Feb becomes 3 Mar); a different day means an invalid date.
  if (new Date(at).getUTCDate() !== +day) return undefined;
  return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS);
}

/**
 * Thrown when a request to the Sleeper API fails at the network level
 * (e.g. DNS resolution failure, connection refused, connection reset while
 * reading the body).
 *
 * The underlying error is available via the standard `cause` property.
 */
export class SleeperNetworkError extends SleeperError {
  constructor(message: string, options?: { cause?: unknown; url?: string }) {
    super(message, options);
    this.name = 'SleeperNetworkError';
  }
}

/**
 * Thrown when a request exceeds its `timeoutMs` budget. The request is
 * aborted (its `fetch` receives an abort signal), so no socket is left open.
 *
 * The budget starts once the request's `rateLimitMs` slot arrives, so time
 * spent waiting for a throttle slot never counts against it.
 *
 * Extends {@link SleeperNetworkError}, so existing `instanceof
 * SleeperNetworkError` checks still match. The abort reason is the `cause`.
 */
export class SleeperTimeoutError extends SleeperNetworkError {
  /** The full request URL that timed out. */
  declare readonly url: string;
  /** The budget that was exceeded, in milliseconds. */
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number, options?: { cause?: unknown }) {
    super(`Request to ${url} timed out after ${timeoutMs} ms`, { ...options, url });
    this.name = 'SleeperTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when a successful response's body is not valid JSON (for example an
 * HTML maintenance page served by a proxy).
 */
export class SleeperParseError extends SleeperError {
  /** The full request URL whose body could not be parsed. */
  declare readonly url: string;
  /** The first 1,000 characters of the body that failed to parse. */
  readonly body: string;

  constructor(url: string, body: string, options?: { cause?: unknown }) {
    super(`Invalid JSON in response from ${url}`, { ...options, url });
    this.name = 'SleeperParseError';
    this.body = body.slice(0, MAX_ERROR_BODY_LENGTH);
  }
}
