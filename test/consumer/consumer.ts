// Type-checked against the packed package by scripts/check-consumer.mjs, the
// way a real consumer sees it: every runtime and type export must resolve, and
// value imports must exist at runtime.
import {
  SleeperClient,
  SleeperError,
  SleeperApiError,
  SleeperNetworkError,
  SleeperTimeoutError,
  SleeperParseError,
  avatarUrl,
  avatarThumbnailUrl,
} from '@curtislabs/sleeper-ts';
import type * as T from '@curtislabs/sleeper-ts';

const client = new SleeperClient({
  rateLimitMs: 60,
  timeoutMs: 5_000,
  headers: { 'User-Agent': 'consumer-check' },
  fetch: (url, init) => fetch(url, init),
});

const leagues: T.LeagueNamespace = client.leagues;
const users: T.UserNamespace = client.users;
const players: T.PlayerNamespace = client.players;
const drafts: T.DraftNamespace = client.drafts;
const state: T.StateNamespace = client.state;

export async function typeOnly(): Promise<void> {
  const s: T.SportState = await state.get({ sport: 'nba', timeoutMs: 1_000 });
  const ls: T.League[] = await users.getLeagues('1', { season: s.league_season ?? s.season });
  const status: T.LeagueStatus | undefined = ls[0]?.status;
  const lu: T.LeagueUser[] = await leagues.getUsers('1');
  const map: T.PlayersMap = await players.getAll({ position: 'QB', active: true });
  const trending: T.TrendingPlayer[] = await players.getTrending('add', { limit: 5 });
  const d: T.Draft = await drafts.get('1', { signal: AbortSignal.timeout(1_000) });
  void [status, lu, map, trending, d];
}

const errors = [
  new SleeperError('m'),
  new SleeperApiError(404, 'Not Found', 'u'),
  new SleeperNetworkError('m'),
  new SleeperTimeoutError('u', 1),
  new SleeperParseError('u', 'b'),
];
if (!errors.every((e) => e instanceof SleeperError)) throw new Error('error hierarchy broken');
if (!avatarUrl('a').endsWith('/avatars/a') || !avatarThumbnailUrl('a').endsWith('/thumbs/a')) {
  throw new Error('avatar helpers broken');
}
console.log('consumer ok');
