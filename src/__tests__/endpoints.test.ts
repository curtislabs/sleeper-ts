import { describe, it, expect, vi } from 'vitest';
import { SleeperClient } from '../client.js';
import { BASE, jsonResponse, stubFetch } from './helpers.js';

type Request = { signal: AbortSignal };
type Call = (client: SleeperClient, id: string, request?: Request) => Promise<unknown>;

/**
 * Every endpoint method, called with non-default arguments. `id` fills the
 * method's first path segment (a user, league or draft ID, or the sport), and
 * `url` is the exact path expected when `id` is `X1`.
 */
const endpoints: [name: string, call: Call, url: string][] = [
  ['users.get', (c, id, r) => c.users.get(id, r), '/user/X1'],
  [
    'users.getLeagues',
    (c, id, r) => c.users.getLeagues(id, { season: 2023, sport: 'nba', ...r }),
    '/user/X1/leagues/nba/2023',
  ],
  [
    'users.getDrafts',
    (c, id, r) => c.users.getDrafts(id, { season: '2023-summer', sport: 'lcs', ...r }),
    '/user/X1/drafts/lcs/2023-summer',
  ],
  ['leagues.get', (c, id, r) => c.leagues.get(id, r), '/league/X1'],
  ['leagues.getRosters', (c, id, r) => c.leagues.getRosters(id, r), '/league/X1/rosters'],
  ['leagues.getUsers', (c, id, r) => c.leagues.getUsers(id, r), '/league/X1/users'],
  ['leagues.getMatchups', (c, id, r) => c.leagues.getMatchups(id, 7, r), '/league/X1/matchups/7'],
  [
    'leagues.getWinnersBracket',
    (c, id, r) => c.leagues.getWinnersBracket(id, r),
    '/league/X1/winners_bracket',
  ],
  [
    'leagues.getLosersBracket',
    (c, id, r) => c.leagues.getLosersBracket(id, r),
    '/league/X1/losers_bracket',
  ],
  [
    'leagues.getTransactions',
    (c, id, r) => c.leagues.getTransactions(id, 3, r),
    '/league/X1/transactions/3',
  ],
  [
    'leagues.getTradedPicks',
    (c, id, r) => c.leagues.getTradedPicks(id, r),
    '/league/X1/traded_picks',
  ],
  ['leagues.getDrafts', (c, id, r) => c.leagues.getDrafts(id, r), '/league/X1/drafts'],
  ['drafts.get', (c, id, r) => c.drafts.get(id, r), '/draft/X1'],
  ['drafts.getPicks', (c, id, r) => c.drafts.getPicks(id, r), '/draft/X1/picks'],
  ['drafts.getTradedPicks', (c, id, r) => c.drafts.getTradedPicks(id, r), '/draft/X1/traded_picks'],
  ['state.get', (c, id, r) => c.state.get({ sport: id, ...r }), '/state/X1'],
  ['players.getAll', (c, id, r) => c.players.getAll({ sport: id, ...r }), '/players/X1'],
  [
    'players.getAll with filters',
    (c, id, r) => c.players.getAll({ sport: id, position: 'QB', active: true, ...r }),
    '/players/X1?position=QB&active=true',
  ],
  [
    'players.getTrending',
    (c, id, r) => c.players.getTrending('drop', { sport: id, lookbackHours: 48, limit: 5, ...r }),
    '/players/X1/trending/drop?lookback_hours=48&limit=5',
  ],
];

/** Calls that rely on default arguments. */
const defaults: [name: string, call: (client: SleeperClient) => Promise<unknown>, url: string][] = [
  [
    'users.getLeagues',
    (c) => c.users.getLeagues('7', { season: '2024' }),
    '/user/7/leagues/nfl/2024',
  ],
  ['users.getDrafts', (c) => c.users.getDrafts('7', { season: 2024 }), '/user/7/drafts/nfl/2024'],
  ['state.get', (c) => c.state.get(), '/state/nfl'],
  ['players.getAll', (c) => c.players.getAll(), '/players/nfl'],
  ['players.getAll, active: false', (c) => c.players.getAll({ active: false }), '/players/nfl'],
  ['players.getTrending', (c) => c.players.getTrending('add'), '/players/nfl/trending/add'],
];

describe('endpoints', () => {
  it.each(endpoints)('%s requests the right URL and returns the body', async (_, call, url) => {
    const body = { marker: url };
    const fetchMock = stubFetch(() => jsonResponse(body));

    await expect(call(new SleeperClient(), 'X1')).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}${url}`);
  });

  it.each(defaults)('%s uses its defaults', async (_, call, url) => {
    const fetchMock = stubFetch();
    await call(new SleeperClient());
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}${url}`);
  });

  it.each(endpoints)('%s forwards its request signal to fetch', async (_, call) => {
    const controller = new AbortController();
    let abortedInFetch: boolean | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        // Aborting the caller's signal mid-request must abort fetch's signal.
        controller.abort();
        abortedInFetch = init?.signal?.aborted;
        return Promise.resolve(jsonResponse({}));
      }),
    );

    // This mock fetch ignores the abort, so the call may still resolve.
    await call(new SleeperClient(), 'X1', { signal: controller.signal }).catch(() => undefined);
    expect(abortedInFetch).toBe(true);
  });

  it.each(endpoints)('%s encodes its ID into a single path segment', async (_, call, url) => {
    const fetchMock = stubFetch();
    await call(new SleeperClient(), 'a/b?c#d');
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}${url.replace('X1', 'a%2Fb%3Fc%23d')}`);
  });

  it.each(endpoints)('%s rejects (never throws) for an unusable ID', async (_, call) => {
    const fetchMock = stubFetch();
    for (const id of ['..', '.', '']) {
      let promise: Promise<unknown> | undefined;
      expect(() => (promise = call(new SleeperClient(), id))).not.toThrow();
      await expect(promise).rejects.toThrow(RangeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
