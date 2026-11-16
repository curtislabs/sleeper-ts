import { assertOptions, path } from '../util.js';
import type { HttpClient } from '../http.js';
import type { User, League, Draft, SeasonOptions, RequestOptions } from '../types.js';

/** Throw a TypeError unless `options` carries a usable `season` (plain JavaScript can pass anything). */
function checkSeasonOptions(options: SeasonOptions): void {
  assertOptions('options', options, true);
  const season: unknown = options.season;
  if ((typeof season !== 'string' && typeof season !== 'number') || season === '') {
    throw new TypeError(`options.season must be a season such as 2024, got ${String(season)}`);
  }
}

/** Namespace for user-related API endpoints. Accessed via {@link SleeperClient.users}. */
export class UserNamespace {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get a user by username or user ID.
   *
   * Sleeper answers an unknown username or ID with `200` and a `null` body;
   * the client turns that into a `404` {@link SleeperApiError}.
   *
   * Usernames can change over time, so store `user_id` rather than the username.
   *
   * @param usernameOrId - A Sleeper username or numeric user ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns The user object.
   * @throws {SleeperApiError} With `status` `404` when no such user exists.
   */
  async get(usernameOrId: string, request?: RequestOptions): Promise<User> {
    return this.http.get<User>(path`/user/${usernameOrId}`, { request });
  }

  /**
   * Get all leagues a user is in for a season.
   *
   * @example
   * ```ts
   * await client.users.getLeagues(userId, { season: 2024 });
   * await client.users.getLeagues(userId, { season: state.league_season ?? state.season, sport: 'nba' });
   * ```
   *
   * @param userId - The Sleeper user ID.
   * @param options - `season` (required), `sport` (defaults to `'nfl'`), plus `signal` and `timeoutMs`.
   * @returns Array of leagues; `[]` for a season with none, or an unknown user or season.
   *   Unlike `leagues.get()`, these records include `last_transaction_id`.
   * @throws {TypeError} (as a rejected promise) If `options` or `options.season` is missing.
   */
  async getLeagues(userId: string, options: SeasonOptions): Promise<League[]> {
    checkSeasonOptions(options);
    const { season, sport = 'nfl', ...request } = options;
    return this.http.get<League[]>(path`/user/${userId}/leagues/${sport}/${season}`, { request });
  }

  /**
   * Get all drafts a user took part in for a season.
   *
   * This endpoint returns less than the others: `creators` and `draft_order`
   * are always `null`, and `settings.pick_timer` is capped at 32767. Use
   * `drafts.get()` or `leagues.getDrafts()` for the full values.
   *
   * @param userId - The Sleeper user ID.
   * @param options - `season` (required), `sport` (defaults to `'nfl'`), plus `signal` and `timeoutMs`.
   * @returns Array of drafts; `[]` for a season with none, or an unknown user or season.
   * @throws {TypeError} (as a rejected promise) If `options` or `options.season` is missing.
   */
  async getDrafts(userId: string, options: SeasonOptions): Promise<Draft[]> {
    checkSeasonOptions(options);
    const { season, sport = 'nfl', ...request } = options;
    return this.http.get<Draft[]>(path`/user/${userId}/drafts/${sport}/${season}`, { request });
  }
}
