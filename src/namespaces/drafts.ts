import { path } from '../util.js';
import type { HttpClient } from '../http.js';
import type { Draft, DraftPick, TradedPick, RequestOptions } from '../types.js';

/**
 * Namespace for draft-related API endpoints. Accessed via {@link SleeperClient.drafts}.
 * Every method rejects with a `404` {@link SleeperApiError} for an unknown draft ID.
 */
export class DraftNamespace {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get a draft by its ID.
   * @param draftId - The Sleeper draft ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns The draft. Only this endpoint includes `slot_to_roster_id`, and it
   *   returns the full `draft_order`, `creators` and `settings.pick_timer`.
   */
  async get(draftId: string, request?: RequestOptions): Promise<Draft> {
    return this.http.get<Draft>(path`/draft/${draftId}`, { request });
  }

  /**
   * Get all picks made in a draft.
   * @param draftId - The Sleeper draft ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of draft picks in pick order.
   */
  async getPicks(draftId: string, request?: RequestOptions): Promise<DraftPick[]> {
    return this.http.get<DraftPick[]>(path`/draft/${draftId}/picks`, { request });
  }

  /**
   * Get all traded picks within a draft.
   * @param draftId - The Sleeper draft ID.
   * @param request - Optional per-call `signal` and `timeoutMs`.
   * @returns Array of traded picks showing current and previous ownership.
   */
  async getTradedPicks(draftId: string, request?: RequestOptions): Promise<TradedPick[]> {
    return this.http.get<TradedPick[]>(path`/draft/${draftId}/traded_picks`, { request });
  }
}
