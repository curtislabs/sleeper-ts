import { assertOptions, assertPositiveInt, path } from '../util.js';
import type { HttpClient } from '../http.js';
import type {
  PlayersMap,
  PlayersOptions,
  TrendingPlayer,
  TrendingType,
  TrendingPlayersOptions,
} from '../types.js';

/** Namespace for player-related API endpoints. Accessed via {@link SleeperClient.players}. */
export class PlayerNamespace {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get all players for a sport, optionally filtered by position or active status.
   *
   * **Note:** The unfiltered NFL response is about 15 MB. Sleeper asks clients
   * to fetch it at most once a day and store it themselves. Filter it when you
   * only need a subset.
   *
   * @example
   * ```ts
   * const qbs = await client.players.getAll({ position: 'QB', active: true });
   * ```
   *
   * @param options - `sport` (defaults to `'nfl'`), `position` and `active`
   *   filters, plus `signal` and `timeoutMs`.
   * @returns A map of player IDs to player objects; `{}` for an unknown sport or position.
   * @throws {RangeError} (as a rejected promise) If `position` is an empty string.
   */
  async getAll(options: PlayersOptions = {}): Promise<PlayersMap> {
    assertOptions('options', options);
    const { sport = 'nfl', position, active, ...request } = options;
    if (position === '') throw new RangeError('position must not be empty');

    const query: Record<string, string> = {};
    if (position !== undefined) query['position'] = position;
    // Sleeper ignores any value other than `true`, so only send that.
    if (active === true) query['active'] = 'true';
    return this.http.get<PlayersMap>(path`/players/${sport}`, { query, request });
  }

  /**
   * Get trending player adds or drops.
   *
   * Sleeper caps `limit` at 100 and `lookbackHours` at 168 (one week); larger
   * values return the capped result.
   *
   * @param type - `'add'` for trending adds, `'drop'` for trending drops.
   * @param options - `sport` (default `'nfl'`), `lookbackHours` (default 24) and
   *   `limit` (default 25), plus `signal` and `timeoutMs`.
   * @returns Array of trending players sorted by count.
   * @throws {RangeError} (as a rejected promise) If `limit` or `lookbackHours` is not a positive integer.
   */
  async getTrending(
    type: TrendingType,
    options: TrendingPlayersOptions = {},
  ): Promise<TrendingPlayer[]> {
    assertOptions('options', options);
    const { sport = 'nfl', lookbackHours, limit, ...request } = options;
    const query: Record<string, number> = {};
    if (lookbackHours !== undefined) {
      assertPositiveInt('lookbackHours', lookbackHours);
      query['lookback_hours'] = lookbackHours;
    }
    if (limit !== undefined) {
      assertPositiveInt('limit', limit);
      query['limit'] = limit;
    }
    return this.http.get<TrendingPlayer[]>(path`/players/${sport}/trending/${type}`, {
      query,
      request,
    });
  }
}
