import { describe, it, expect } from 'vitest';
import {
  SleeperError,
  SleeperApiError,
  SleeperNetworkError,
  SleeperParseError,
  SleeperTimeoutError,
  parseRetryAfterMs,
} from '../errors.js';

describe('SleeperApiError', () => {
  it('stores status, statusText, url, and body', () => {
    const error = new SleeperApiError(
      404,
      'Not Found',
      'https://api.sleeper.app/v1/user/abc',
      '{}',
    );
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error.url).toBe('https://api.sleeper.app/v1/user/abc');
    expect(error.body).toBe('{}');
    expect(error.name).toBe('SleeperApiError');
    expect(error.message).toContain('404');
    expect(error.message).toContain('Not Found');
  });

  it('works without body', () => {
    const error = new SleeperApiError(500, 'Internal Server Error', 'https://example.com');
    expect(error.body).toBeUndefined();
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.headers).toBeUndefined();
  });

  it('stores retryAfterMs and headers', () => {
    const headers = new Headers({ 'retry-after': '3' });
    const error = new SleeperApiError(429, 'Too Many Requests', 'https://example.com', '', {
      retryAfterMs: 3000,
      headers,
    });
    expect(error.retryAfterMs).toBe(3000);
    expect(error.headers).toBe(headers);
  });

  it('is an instance of Error', () => {
    const error = new SleeperApiError(400, 'Bad Request', 'https://example.com');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('SleeperNetworkError', () => {
  it('stores message and cause', () => {
    const cause = new TypeError('fetch failed');
    const error = new SleeperNetworkError('Failed to fetch', { cause });
    expect(error.name).toBe('SleeperNetworkError');
    expect(error.message).toBe('Failed to fetch');
    expect(error.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const error = new SleeperNetworkError('Network error');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('SleeperTimeoutError', () => {
  it('is a SleeperNetworkError carrying url, timeoutMs and cause', () => {
    const cause = new DOMException('Timed out', 'TimeoutError');
    const error = new SleeperTimeoutError('https://example.com/x', 1500, { cause });
    expect(error).toBeInstanceOf(SleeperNetworkError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SleeperTimeoutError');
    expect(error.url).toBe('https://example.com/x');
    expect(error.timeoutMs).toBe(1500);
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('1500 ms');
  });
});

describe('error hierarchy', () => {
  it('names every class and makes each a SleeperError', () => {
    const errors = [
      [new SleeperError('m'), 'SleeperError'],
      [new SleeperApiError(500, 'x', 'u'), 'SleeperApiError'],
      [new SleeperNetworkError('m'), 'SleeperNetworkError'],
      [new SleeperTimeoutError('u', 1), 'SleeperTimeoutError'],
      [new SleeperParseError('u', 'b'), 'SleeperParseError'],
    ] as const;
    for (const [error, name] of errors) {
      expect(error.name).toBe(name);
      expect(error).toBeInstanceOf(SleeperError);
    }
  });

  it('truncates bodies to 1,000 characters', () => {
    expect(new SleeperApiError(500, 'x', 'u', 'y'.repeat(2_000)).body).toHaveLength(1_000);
    expect(new SleeperParseError('u', 'y'.repeat(2_000)).body).toHaveLength(1_000);
  });

  it('only sets cause when one is given', () => {
    expect('cause' in new SleeperError('m')).toBe(false);
    expect(new SleeperError('m', { cause: 0 }).cause).toBe(0);
  });
});

describe('parseRetryAfterMs', () => {
  const now = Date.parse('1994-11-06T08:49:00Z');

  it.each([
    ['Sun, 06 Nov 1994 08:49:37 GMT', 37_000],
    ['120', 120_000],
    [' 5 ', 5_000],
    ['Sun, 06 Nov 1994 08:00:00 GMT', 0],
  ])('parses %j', (header, ms) => {
    expect(parseRetryAfterMs(header, now)).toBe(ms);
  });

  it.each([
    'abc 2025',
    'Sunday, 06-Nov-94 08:49:37 GMT',
    'Sun Nov  6 08:49:37 1994',
    'Thu 1',
    '1.5',
    '-5',
    '1e3',
    '120 seconds',
    '',
    'soon',
    'Sun, 99 Nov 1994 08:49:37 GMT',
    'Tue, 31 Feb 1995 08:49:37 GMT',
    'Sun, 06 Nov 1994 25:49:37 GMT',
    'Sun, 06 Nov 1994 08:49:37 GMT junk',
    'Sun, 06 Foo 1994 08:49:37 GMT',
  ])('rejects %j', (header) => {
    expect(parseRetryAfterMs(header, now)).toBeUndefined();
  });

  it('caps absurd waits at the largest timer delay', () => {
    expect(parseRetryAfterMs('99999999999999999999999', now)).toBe(2_147_483_647);
    expect(parseRetryAfterMs('Fri, 01 Jan 2100 00:00:00 GMT', now)).toBe(2_147_483_647);
  });

  it('puts the URL in an API error message', () => {
    expect(new SleeperApiError(500, 'x', 'https://u/x').message).toContain('https://u/x');
  });
});
