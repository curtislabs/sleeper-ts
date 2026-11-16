import { describe, it, expect, expectTypeOf, vi } from 'vitest';
import { SleeperClient } from '../client.js';
import * as api from '../index.js';
import type * as T from '../index.js';
import { SleeperTimeoutError } from '../errors.js';
import { BASE, jsonResponse, settle, slowFetch, stubFetch } from './helpers.js';

describe('SleeperClient options', () => {
  it('uses the default base URL and has no default timeout or headers', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    await new SleeperClient().state.get();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/state/nfl`);
    expect(init).toEqual({ signal: expect.any(AbortSignal) });
    // No timeout timer was started.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends requests to a custom baseUrl, ignoring trailing slashes', async () => {
    const fetchMock = stubFetch();
    await new SleeperClient({ baseUrl: 'https://proxy.example/sleeper//' }).state.get();
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.example/sleeper/state/nfl');
  });

  it('uses an injected fetch instead of the global one', async () => {
    const globalFetch = stubFetch();
    const injected = vi.fn(() => Promise.resolve(jsonResponse({ week: 1 })));
    const client = new SleeperClient({ fetch: injected });
    await expect(client.state.get()).resolves.toEqual({ week: 1 });
    expect(injected).toHaveBeenCalledWith(`${BASE}/state/nfl`, {
      signal: expect.any(AbortSignal),
    });
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('reads the global fetch at call time when none is injected', async () => {
    const client = new SleeperClient();
    const late = stubFetch(() => jsonResponse({ late: true }));
    await expect(client.state.get()).resolves.toEqual({ late: true });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('sends the configured headers with every request, copied at construction', async () => {
    const fetchMock = stubFetch();
    const headers = { 'User-Agent': 'my-app/1.0' };
    const client = new SleeperClient({ headers });
    headers['User-Agent'] = 'changed';
    await client.leagues.get('1');
    expect(fetchMock.mock.calls[0][1]).toEqual({
      signal: expect.any(AbortSignal),
      headers: { 'User-Agent': 'my-app/1.0' },
    });
  });

  it('wires a fixed rateLimitMs into every namespace', async () => {
    vi.useFakeTimers();
    const dispatchedAt: number[] = [];
    stubFetch(undefined, dispatchedAt);
    const client = new SleeperClient({ rateLimitMs: 300 });
    const start = Date.now();

    const calls = [client.state.get(), client.leagues.get('1'), client.players.getTrending('add')];
    await vi.advanceTimersByTimeAsync(600);
    await Promise.all(calls);

    expect(dispatchedAt.map((t) => t - start)).toEqual([0, 300, 600]);
  });

  it('wires timeoutMs', async () => {
    vi.useFakeTimers();
    slowFetch(5_000);
    const call = settle(new SleeperClient({ timeoutMs: 300 }).drafts.get('1'));
    await vi.advanceTimersByTimeAsync(300);
    await expect(call).rejects.toBeInstanceOf(SleeperTimeoutError);
  });

  it.each([
    ['options', 'nfl'],
    ['fetch', { fetch: 'not a function' }],
    ['headers', { headers: 'User-Agent: x' }],
  ])('rejects a malformed %s with TypeError', (_, options) => {
    expect(() => new SleeperClient(options as never)).toThrow(TypeError);
  });
});

type LooseCall = (...args: unknown[]) => Promise<unknown>;
/** The client as plain JavaScript sees it: any arguments allowed. */
const loose = (c: SleeperClient) => c as unknown as Record<string, Record<string, LooseCall>>;

describe('plain JavaScript callers passing the wrong argument shape', () => {
  // TypeScript rejects these at compile time; at runtime they must fail
  // loudly instead of requesting the wrong URL.
  it.each<[string, (c: SleeperClient) => Promise<unknown>]>([
    ['users.getLeagues(id, sport, season)', (c) => loose(c).users.getLeagues('1', 'nfl', '2024')],
    ['users.getDrafts(id, season)', (c) => loose(c).users.getDrafts('1', '2024')],
    ['users.getLeagues(id, {})', (c) => loose(c).users.getLeagues('1', {})],
    ['state.get(sport)', (c) => loose(c).state.get('nba')],
    ['players.getAll(sport)', (c) => loose(c).players.getAll('nfl')],
    ['players.getTrending(type, sport)', (c) => loose(c).players.getTrending('add', 'nba')],
    ['leagues.get(id, "x")', (c) => loose(c).leagues.get('1', 'x')],
  ])('%s rejects with TypeError and sends nothing', async (_, call) => {
    const fetchMock = stubFetch();
    await expect(call(new SleeperClient())).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('public exports', () => {
  it('exports exactly the documented runtime API', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'SleeperClient',
        'SleeperError',
        'SleeperApiError',
        'SleeperNetworkError',
        'SleeperTimeoutError',
        'SleeperParseError',
        'avatarUrl',
        'avatarThumbnailUrl',
      ].sort(),
    );
  });

  it('exports classes that behave as expected', () => {
    const error = new api.SleeperTimeoutError('u', 1);
    expect(error).toBeInstanceOf(api.SleeperNetworkError);
    expect(error).toBeInstanceOf(api.SleeperError);
    expect(new api.SleeperClient().players).toBeDefined();
  });
});

// Compile-time: removing any of these exports fails `npm run typecheck`.
type ExportedTypes = [
  T.SleeperClientOptions,
  T.FetchFunction,
  T.RequestOptions,
  T.Sport,
  T.Season,
  T.SportOptions,
  T.SeasonOptions,
  T.PlayersOptions,
  T.TrendingType,
  T.TrendingPlayersOptions,
  T.LeagueStatus,
  T.SeasonType,
  T.DraftType,
  T.DraftStatus,
  T.TransactionType,
  T.TransactionStatus,
  T.League,
  T.LeagueSettings,
  T.Roster,
  T.User,
  T.LeagueUser,
  T.Player,
  T.PlayersMap,
  T.Matchup,
  T.Draft,
  T.DraftSettings,
  T.DraftPick,
  T.DraftPickMetadata,
  T.Transaction,
  T.TransactionSettings,
  T.WaiverBudgetTransfer,
  T.TradedPick,
  T.BracketMatchup,
  T.BracketSource,
  T.SportState,
  T.TrendingPlayer,
  T.SleeperApiErrorOptions,
  T.LeagueNamespace,
  T.UserNamespace,
  T.PlayerNamespace,
  T.DraftNamespace,
  T.StateNamespace,
];

describe('public type exports', () => {
  it('exports every documented type', () => {
    expectTypeOf<ExportedTypes>().not.toBeNever();
  });

  it('names the namespace instance types', () => {
    expectTypeOf<T.LeagueNamespace>().toEqualTypeOf<SleeperClient['leagues']>();
  });
});
