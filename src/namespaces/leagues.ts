import { assertNonNegativeInt, path } from '../util.js';
import type { HttpClient } from '../http.js';
import type {
  League,
  Roster,
  LeagueUser,
  Matchup,
  BracketMatchup,
  Transaction,
  TradedPick,
  Draft,
  RequestOptions,
} from '../types.js';

/**
 * Namespace for league-related API endpoints. Accessed via {@link SleeperClient.leagues}.
 *
 * **Unknown league IDs:** `get`, `getRosters`, `getMatchups`, `getWinnersBracket`
 * and `getLosersBracket` reject with a `404` {@link SleeperApiError}, but
 * `getUsers`, `getTransactions`, `getTradedPicks` and `getDrafts` resolve to
 * `[]`. That is how Sleeper answers; don't rely on those four to validate an ID.
 * (A non-numeric ID is a 404 everywhere.)
 */
export class LeagueNamespace {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get a league by its ID.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns The league object.
   */
  async get(leagueId: string, request?: RequestOptions): Promise<League> {
    return this.http.get<League>(path`/league/${leagueId}`, { request });
  }

  /**
   * Get all rosters in a league.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of rosters with player lists, records, and settings. Before the
   *   draft, `players` is `null` and `starters` holds `"0"` placeholders.
   */
  async getRosters(leagueId: string, request?: RequestOptions): Promise<Roster[]> {
    return this.http.get<Roster[]>(path`/league/${leagueId}/rosters`, { request });
  }

  /**
   * Get all users in a league.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns The league's members. These records never include `username`.
   */
  async getUsers(leagueId: string, request?: RequestOptions): Promise<LeagueUser[]> {
    return this.http.get<LeagueUser[]>(path`/league/${leagueId}/users`, { request });
  }

  /**
   * Get matchups for a specific week.
   * @param leagueId - The Sleeper league ID.
   * @param week - The week number. Regular-season weeks start at 1; week 0 (the off-season
   *   value of `SportState.week`) and weeks with no games resolve to `[]`.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of matchup entries. Two entries sharing the same `matchup_id` are opponents.
   * @throws {RangeError} (as a rejected promise) If `week` is not a non-negative integer.
   */
  async getMatchups(leagueId: string, week: number, request?: RequestOptions): Promise<Matchup[]> {
    assertNonNegativeInt('week', week);
    return this.http.get<Matchup[]>(path`/league/${leagueId}/matchups/${week}`, { request });
  }

  /**
   * Get the winners (championship) playoff bracket.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of bracket matchups for the winners bracket; `[]` when the league
   *   has no playoff bracket (Sleeper answers `null`).
   */
  async getWinnersBracket(leagueId: string, request?: RequestOptions): Promise<BracketMatchup[]> {
    return this.http.get<BracketMatchup[]>(path`/league/${leagueId}/winners_bracket`, {
      request,
      onNull: 'empty',
    });
  }

  /**
   * Get the losers (consolation) playoff bracket.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of bracket matchups for the losers bracket; `[]` when the league
   *   has no playoff bracket (Sleeper answers `null`).
   */
  async getLosersBracket(leagueId: string, request?: RequestOptions): Promise<BracketMatchup[]> {
    return this.http.get<BracketMatchup[]>(path`/league/${leagueId}/losers_bracket`, {
      request,
      onNull: 'empty',
    });
  }

  /**
   * Get transactions for a specific round (week).
   * @param leagueId - The Sleeper league ID.
   * @param round - The round (week) number; equals `Transaction.leg`. Round 0 resolves to `[]`.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of transactions (trades, waivers, free agent moves).
   * @throws {RangeError} (as a rejected promise) If `round` is not a non-negative integer.
   */
  async getTransactions(
    leagueId: string,
    round: number,
    request?: RequestOptions,
  ): Promise<Transaction[]> {
    assertNonNegativeInt('round', round);
    return this.http.get<Transaction[]>(path`/league/${leagueId}/transactions/${round}`, {
      request,
    });
  }

  /**
   * Get all traded draft picks in a league.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of traded draft picks showing current and previous ownership.
   */
  async getTradedPicks(leagueId: string, request?: RequestOptions): Promise<TradedPick[]> {
    return this.http.get<TradedPick[]>(path`/league/${leagueId}/traded_picks`, { request });
  }

  /**
   * Get all drafts for a league.
   * @param leagueId - The Sleeper league ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of drafts associated with the league.
   */
  async getDrafts(leagueId: string, request?: RequestOptions): Promise<Draft[]> {
    return this.http.get<Draft[]>(path`/league/${leagueId}/drafts`, { request });
  }
}
