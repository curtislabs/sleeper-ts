import { HttpClient } from './http.js';
import { assertOptions } from './util.js';
import {
  LeagueNamespace,
  UserNamespace,
  PlayerNamespace,
  DraftNamespace,
  StateNamespace,
} from './namespaces/index.js';
import type { SleeperClientOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://api.sleeper.app/v1';

/**
 * Client for the Sleeper Fantasy Sports API.
 *
 * All API methods are organized into namespaces accessible as properties
 * on the client instance. The client keeps no data between calls; its only
 * state is the next `rateLimitMs` slot.
 *
 * @example
 * ```ts
 * import { SleeperClient } from '@curtislabs/sleeper-ts';
 *
 * const client = new SleeperClient();
 * const user = await client.users.get('johndoe');
 * const leagues = await client.users.getLeagues(user.user_id, { season: 2024 });
 * ```
 */
export class SleeperClient {
  /** League-related endpoints (rosters, matchups, brackets, transactions, etc.). */
  readonly leagues: LeagueNamespace;
  /** User-related endpoints (lookup, leagues, drafts). */
  readonly users: UserNamespace;
  /** Player-related endpoints (all players, trending). */
  readonly players: PlayerNamespace;
  /** Draft-related endpoints (draft details, picks, traded picks). */
  readonly drafts: DraftNamespace;
  /** Sport state endpoint (current week, season, etc.). */
  readonly state: StateNamespace;

  /**
   * Create a new Sleeper API client.
   * @param options - Base URL, rate limiting, timeout, `fetch` and headers.
   * @throws {RangeError} If a millisecond option is negative, `NaN` or not a
   *   number, or `rateLimitMs` is infinite.
   * @throws {TypeError} If `options`, `fetch` or `headers` has the wrong type.
   */
  constructor(options: SleeperClientOptions = {}) {
    assertOptions('options', options);
    const http = new HttpClient({ ...options, baseUrl: options.baseUrl ?? DEFAULT_BASE_URL });

    this.leagues = new LeagueNamespace(http);
    this.users = new UserNamespace(http);
    this.players = new PlayerNamespace(http);
    this.drafts = new DraftNamespace(http);
    this.state = new StateNamespace(http);
  }
}
