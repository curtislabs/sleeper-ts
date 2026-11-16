import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '../http.js';
import { MAX_TIMER_MS, parseJson, path } from '../util.js';
import { SleeperClient } from '../client.js';
import {
  SleeperError,
  SleeperApiError,
  SleeperNetworkError,
  SleeperParseError,
} from '../errors.js';
import { BASE, jsonResponse, rejectionOf, settle, stubFetch, textResponse } from './helpers.js';

describe('HttpClient requests', () => {
  it('calls fetch with the URL and an abort signal, and returns the parsed body', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: '1' }));
    await expect(new HttpClient({ baseUrl: BASE }).get('/league/123')).resolves.toEqual({
      id: '1',
    });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/league/123`, {
      signal: expect.any(AbortSignal),
    });
  });

  it('appends query parameters, encoding values once', async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    await new HttpClient({ baseUrl: BASE }).get('/x', { query: { position: 'Q&B', limit: 10 } });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/x?position=Q%26B&limit=10`);
  });

  it('accepts empty arrays and objects as successful bodies', async () => {
    stubFetch(() => jsonResponse([]));
    await expect(new HttpClient({ baseUrl: BASE }).get('/x')).resolves.toEqual([]);
    stubFetch(() => jsonResponse({}));
    await expect(new HttpClient({ baseUrl: BASE }).get('/x')).resolves.toEqual({});
  });
});

describe('HttpClient errors', () => {
  it('throws SleeperApiError with status, text, url and body for a non-2xx response', async () => {
    stubFetch(() => textResponse('nope', { status: 503, statusText: 'Service Unavailable' }));
    const error = await rejectionOf(new HttpClient({ baseUrl: BASE }).get('/league/1'));
    expect(error).toBeInstanceOf(SleeperApiError);
    expect(error).toBeInstanceOf(SleeperError);
    expect(error).toMatchObject({
      name: 'SleeperApiError',
      status: 503,
      statusText: 'Service Unavailable',
      url: `${BASE}/league/1`,
      body: 'nope',
    });
  });

  it('keeps only the first 1,000 characters of an error body', async () => {
    stubFetch(() => textResponse('x'.repeat(5_000), { status: 502 }));
    const error = (await rejectionOf(
      new HttpClient({ baseUrl: BASE }).get('/x'),
    )) as SleeperApiError;
    expect(error.body).toHaveLength(1_000);
  });

  it('turns a 200 with a null body into a 404 SleeperApiError', async () => {
    stubFetch(() => textResponse('null'));
    const error = await rejectionOf(new SleeperClient().users.get('nobody'));
    expect(error).toBeInstanceOf(SleeperApiError);
    expect(error).toMatchObject({
      status: 404,
      statusText: 'Not Found',
      url: `${BASE}/user/nobody`,
    });
  });

  it('throws SleeperNetworkError with the url when fetch fails', async () => {
    const cause = new TypeError('fetch failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    const error = await rejectionOf(new HttpClient({ baseUrl: BASE }).get('/x'));
    expect(error).toBeInstanceOf(SleeperNetworkError);
    expect(error).toMatchObject({ name: 'SleeperNetworkError', url: `${BASE}/x`, cause });
  });

  it('throws SleeperNetworkError when fetch fails while a signal is in play', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const error = await rejectionOf(
      new HttpClient({ baseUrl: BASE }).get('/x', {
        request: { signal: new AbortController().signal },
      }),
    );
    expect(error).toBeInstanceOf(SleeperNetworkError);
  });

  it('throws SleeperNetworkError when the body read fails', async () => {
    const reset = new TypeError('terminated');
    // A real Response whose body stream fails, like a connection reset mid-body.
    stubFetch(() => new Response(new ReadableStream({ start: (c) => c.error(reset) })));
    const error = await rejectionOf(new HttpClient({ baseUrl: BASE }).get('/state/nfl'));
    expect(error).toBeInstanceOf(SleeperNetworkError);
    expect(error).toMatchObject({ url: `${BASE}/state/nfl`, cause: reset });
  });

  it('throws SleeperParseError for a non-JSON success body', async () => {
    stubFetch(() => textResponse('<html>maintenance</html>'));
    const error = await rejectionOf(new HttpClient({ baseUrl: BASE }).get('/state/nfl'));
    expect(error).toBeInstanceOf(SleeperParseError);
    expect(error).toBeInstanceOf(SleeperError);
    expect(error).toMatchObject({
      name: 'SleeperParseError',
      url: `${BASE}/state/nfl`,
      body: '<html>maintenance</html>',
    });
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });

  it('keeps an API status over a caller abort that cut off the error body', async () => {
    const controller = new AbortController();
    // A real 503 whose body read is cut off by the caller's abort.
    stubFetch(
      () =>
        new Response(
          new ReadableStream({
            pull: (c) => {
              controller.abort();
              c.error(new DOMException('aborted', 'AbortError'));
            },
          }),
          { status: 503, statusText: 'Service Unavailable' },
        ),
    );
    const error = await rejectionOf(
      new HttpClient({ baseUrl: BASE }).get('/x', { request: { signal: controller.signal } }),
    );
    expect(error).toBeInstanceOf(SleeperApiError);
    expect((error as SleeperApiError).status).toBe(503);
  });
});

describe('path', () => {
  it('percent-encodes interpolated values', () => {
    expect(path`/user/${'a/b?x=1#frag'}/x/${3}`).toBe('/user/a%2Fb%3Fx%3D1%23frag/x/3');
  });

  it.each(['', '.', '..'])('rejects %j, which cannot stay one segment', (value) => {
    expect(() => path`/league/${value}/rosters`).toThrow(RangeError);
  });

  it('allows dots inside a value', () => {
    expect(path`/user/${'a.b'}`).toBe('/user/a.b');
  });
});

describe('option validation', () => {
  it.each([
    [{ rateLimitMs: -1 }],
    [{ rateLimitMs: Number.NaN }],
    [{ rateLimitMs: Infinity }],
    [{ timeoutMs: -5 }],
    [{ timeoutMs: Number.NaN }],
    [{ timeoutMs: '100' as unknown as number }],
    [{ rateLimitMs: '100' as unknown as number }],
  ])('the client rejects %o', (options) => {
    expect(() => new SleeperClient(options)).toThrow(RangeError);
  });

  it('rejects an invalid per-call timeoutMs without fetching', async () => {
    const fetchMock = stubFetch();
    await expect(
      new HttpClient({ baseUrl: BASE }).get('/x', { request: { timeoutMs: -1 } }),
    ).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.NaN])('rejects week or round %d', async (n) => {
    const fetchMock = stubFetch();
    const client = new SleeperClient();
    await expect(client.leagues.getMatchups('1', n)).rejects.toThrow(RangeError);
    await expect(client.leagues.getTransactions('1', n)).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it('accepts week and round 0 (the off-season SportState.week)', async () => {
  const fetchMock = stubFetch(() => jsonResponse([]));
  const client = new SleeperClient();
  await expect(client.leagues.getMatchups('1', 0)).resolves.toEqual([]);
  await expect(client.leagues.getTransactions('1', 0)).resolves.toEqual([]);
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    `${BASE}/league/1/matchups/0`,
    `${BASE}/league/1/transactions/0`,
  ]);
});

describe('timer limits', () => {
  // Real timers on purpose: Node fires a setTimeout delay above MAX_TIMER_MS
  // after 1 ms, and fake timers don't reproduce that overflow.
  it.each([MAX_TIMER_MS + 1, Infinity])('treats timeoutMs %d as no timeout', async (timeoutMs) => {
    // A fetch that answers after 20 ms of real time and honours its signal.
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(jsonResponse({ a: 1 })), 20);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(init.signal?.reason);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = new HttpClient({ baseUrl: BASE, timeoutMs }).get('/x');
    await expect(result).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits on one capped timer when rateLimitMs exceeds the timer limit', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const http = new HttpClient({ baseUrl: BASE, rateLimitMs: 2 ** 32 });

    void http.get('/a');
    void http.get('/b');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Without the cap Node would fire a 1 ms timer over and over.
    expect(setTimeoutSpy.mock.calls.map((call) => call[1])).toEqual([MAX_TIMER_MS]);
    vi.useRealTimers();
  });
});

describe('parseJson', () => {
  it('keeps integers beyond MAX_SAFE_INTEGER as exact strings', () => {
    expect(
      parseJson('{"bracket_id":1312110541900103680,"picks":[{"draft_id":376175572520669184}]}'),
    ).toEqual({ bracket_id: '1312110541900103680', picks: [{ draft_id: '376175572520669184' }] });
  });

  it('leaves safe numbers, decimals and quoted IDs alone', () => {
    const text = '{"a":9007199254740991,"b":-12.5,"c":"1312110541900103680","d":[1,2]}';
    expect(parseJson(text)).toEqual({
      a: 9007199254740991,
      b: -12.5,
      c: '1312110541900103680',
      d: [1, 2],
    });
  });

  it('is used for every response', async () => {
    stubFetch(() => textResponse('{"last_transaction_id":1404266784814632960}'));
    await expect(new HttpClient({ baseUrl: BASE }).get('/league/1')).resolves.toEqual({
      last_transaction_id: '1404266784814632960',
    });
  });
});

describe('null bodies', () => {
  it('resolve to [] for a league with no playoff bracket', async () => {
    stubFetch(() => textResponse('null'));
    const client = new SleeperClient();
    await expect(client.leagues.getWinnersBracket('1')).resolves.toEqual([]);
    await expect(client.leagues.getLosersBracket('1')).resolves.toEqual([]);
  });

  it('still reject with 404 for an unknown league bracket (a real 404)', async () => {
    stubFetch(() => textResponse('null', { status: 404, statusText: 'Not Found' }));
    const error = await rejectionOf(new SleeperClient().leagues.getWinnersBracket('1'));
    expect(error).toMatchObject({ name: 'SleeperApiError', status: 404 });
  });

  it('carry the response headers on the 404 they become elsewhere', async () => {
    stubFetch(() => textResponse('null', { headers: { 'x-request-id': 'abc' } }));
    const error = (await rejectionOf(
      new SleeperClient().state.get({ sport: 'zzz' }),
    )) as SleeperApiError;
    expect(error.headers?.get('x-request-id')).toBe('abc');
  });
});

describe('abort and timeout precedence', () => {
  it('reports a caller abort, not a timeout, when the abort lands first', async () => {
    vi.useFakeTimers();
    // A fetch that takes 20 ms to reject after its signal aborts.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              setTimeout(() => reject(init.signal?.reason), 20),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const call = settle(
      new HttpClient({ baseUrl: BASE }).get('/x', {
        request: { signal: controller.signal, timeoutMs: 50 },
      }),
    );
    await vi.advanceTimersByTimeAsync(40);
    controller.abort(new Error('user cancelled'));
    await vi.advanceTimersByTimeAsync(30);
    await expect(call).rejects.toThrow('user cancelled');
  });

  it('rejects an already-aborted call at once instead of queueing it', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    const http = new HttpClient({ baseUrl: BASE, rateLimitMs: 10_000 });
    await http.get('/first');

    const call = settle(http.get('/x', { request: { signal: AbortSignal.abort() } }));
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('parseJson edge positions', () => {
  it.each([
    ['[1312110541900103680]', ['1312110541900103680']],
    ['1312110541900103680', '1312110541900103680'],
    ['{"a":-1312110541900103680}', { a: '-1312110541900103680' }],
    ['{"a":[1,1312110541900103680]}', { a: [1, '1312110541900103680'] }],
    ['{"a":9007199254740993}', { a: '9007199254740993' }],
    ['{"a": 1312110541900103680 }', { a: '1312110541900103680' }],
    ['{"a":\n1312110541900103680\n}', { a: '1312110541900103680' }],
  ])('keeps %s exact', (text, expected) => {
    expect(parseJson(text)).toEqual(expected);
  });

  it('keeps large floats as numbers even when a long ID is present', () => {
    expect(
      parseJson('{"id":1312110541900103680,"a":1e21,"b":12345678901234567.5,"c":1.5e300}'),
    ).toEqual({ id: '1312110541900103680', a: 1e21, b: 12345678901234567.5, c: 1.5e300 });
  });

  it('leaves long digit runs inside strings alone', () => {
    expect(parseJson('{"channel_id":"1116853254748110848","n":1}')).toEqual({
      channel_id: '1116853254748110848',
      n: 1,
    });
  });
});

describe('null body is a 404 everywhere but the brackets', () => {
  type Call = (c: SleeperClient) => Promise<unknown>;
  it.each<[string, Call]>([
    ['users.get', (c) => c.users.get('1')],
    ['users.getLeagues', (c) => c.users.getLeagues('1', { season: 2024 })],
    ['users.getDrafts', (c) => c.users.getDrafts('1', { season: 2024 })],
    ['leagues.get', (c) => c.leagues.get('1')],
    ['leagues.getRosters', (c) => c.leagues.getRosters('1')],
    ['leagues.getUsers', (c) => c.leagues.getUsers('1')],
    ['leagues.getMatchups', (c) => c.leagues.getMatchups('1', 1)],
    ['leagues.getTransactions', (c) => c.leagues.getTransactions('1', 1)],
    ['leagues.getTradedPicks', (c) => c.leagues.getTradedPicks('1')],
    ['leagues.getDrafts', (c) => c.leagues.getDrafts('1')],
    ['drafts.get', (c) => c.drafts.get('1')],
    ['drafts.getPicks', (c) => c.drafts.getPicks('1')],
    ['drafts.getTradedPicks', (c) => c.drafts.getTradedPicks('1')],
    ['state.get', (c) => c.state.get()],
    ['players.getAll', (c) => c.players.getAll()],
    ['players.getTrending', (c) => c.players.getTrending('add')],
  ])('%s', async (_, call) => {
    stubFetch(() => textResponse('null'));
    const error = await rejectionOf(call(new SleeperClient()));
    expect(error).toMatchObject({ name: 'SleeperApiError', status: 404, body: 'null' });
  });
});

describe('timer and spacing boundaries', () => {
  it('honours a timeout of exactly MAX_TIMER_MS', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
          ),
      ),
    );
    const call = settle(new HttpClient({ baseUrl: BASE, timeoutMs: MAX_TIMER_MS }).get('/x'));
    await vi.advanceTimersByTimeAsync(MAX_TIMER_MS);
    await expect(call).rejects.toMatchObject({ name: 'SleeperTimeoutError' });
  });

  it('does not release a call that arrives 999 ms after the last one early', async () => {
    vi.useFakeTimers();
    const dispatchedAt: number[] = [];
    stubFetch(undefined, dispatchedAt);
    const http = new HttpClient({ baseUrl: BASE, rateLimitMs: 1_000 });
    const start = Date.now();
    await http.get('/a');
    await vi.advanceTimersByTimeAsync(999);
    const b = http.get('/b');
    await vi.advanceTimersByTimeAsync(1);
    await b;
    expect(dispatchedAt.map((t) => t - start)).toEqual([0, 1_000]);
  });
});
