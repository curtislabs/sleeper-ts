import { assertOptions, path } from '../util.js';
import type { HttpClient } from '../http.js';
import type { SportOptions, SportState } from '../types.js';

/** Namespace for sport state endpoints. Accessed via {@link SleeperClient.state}. */
export class StateNamespace {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get the current state of a sport (current week, season, season type, etc.).
   * @param options - `sport` (defaults to `'nfl'`), plus `signal` and `timeoutMs`.
   * @returns The current sport state.
   * @throws {SleeperApiError} With `status` `404` for a sport Sleeper doesn't know.
   */
  async get(options: SportOptions = {}): Promise<SportState> {
    assertOptions('options', options);
    const { sport = 'nfl', ...request } = options;
    return this.http.get<SportState>(path`/state/${sport}`, { request });
  }
}
