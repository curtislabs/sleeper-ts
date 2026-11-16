// ─── Client Options ──────────────────────────────────────────────────────────

/**
 * The `fetch` the client calls: the standard `fetch` signature, narrowed to
 * what the client passes (a URL string and an init with `signal` and, when
 * configured, `headers`).
 */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

/** Configuration options for the {@link SleeperClient}. */
export interface SleeperClientOptions {
  /** Base URL for the Sleeper API. Defaults to `https://api.sleeper.app/v1`. */
  baseUrl?: string;
  /**
   * Minimum delay in milliseconds between the starts of two requests. Defaults
   * to `0` (no rate limiting). Calls start in the order they were made. A call
   * aborted while waiting rejects at once, but its slot is not reused.
   */
  rateLimitMs?: number;
  /**
   * Per-request timeout in milliseconds. Each request is aborted with a
   * {@link SleeperTimeoutError} once the budget runs out. The budget starts
   * when the request's `rateLimitMs` slot arrives (at dispatch), not when
   * the method is called. Defaults to no timeout. Can be overridden per call
   * via {@link RequestOptions}. Values above 2,147,483,647 (about 24.8 days),
   * including `Infinity`, mean no timeout.
   */
  timeoutMs?: number;
  /**
   * The `fetch` to send requests with. Defaults to the global `fetch`, read at
   * call time. Use it to inject a test double, add instrumentation, or route
   * through a proxy, without touching globals.
   */
  fetch?: FetchFunction;
  /** Headers to send with every request (for example a `User-Agent`). */
  headers?: Record<string, string>;
}

/**
 * Per-call options accepted by every endpoint method: as the last argument, or
 * inside the method's options object.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * const league = await client.leagues.get('123', { signal: controller.signal, timeoutMs: 5_000 });
 * const state = await client.state.get({ sport: 'nba', timeoutMs: 5_000 });
 * ```
 */
export interface RequestOptions {
  /**
   * Cancels the call. If it fires while the call is waiting for its
   * `rateLimitMs` slot, the call rejects at once; if it fires during the
   * request, the `fetch` is aborted. The call rejects with
   * `signal.reason` (an `AbortError` `DOMException` by default), unless an
   * HTTP error status already arrived and the abort only cut off reading its
   * body: then it rejects with that {@link SleeperApiError}.
   */
  signal?: AbortSignal;
  /**
   * Timeout for this call, overriding the client's `timeoutMs`. `0` disables
   * the timeout for this call, as does any value above 2,147,483,647.
   */
  timeoutMs?: number;
}

// ─── Method Options ──────────────────────────────────────────────────────────

/**
 * Sport identifier accepted by the Sleeper API. The listed sports answer
 * `state.get()`; any string is accepted for forward-compatibility.
 */
export type Sport = 'nfl' | 'nba' | 'lcs' | 'mlb' | 'nhl' | 'wnba' | (string & {});

/**
 * A season, exactly as Sleeper names it: a year (`2024` or `'2024'`) or, for
 * split-season sports, a string such as LCS's `'2023-summer'`. Values read
 * from `League.season`, `Draft.season` or `SportState.season` fit.
 */
export type Season = string | number;

/** Options for `state.get()`. */
export interface SportOptions extends RequestOptions {
  /** Sport identifier. Defaults to `'nfl'`. */
  sport?: Sport;
}

/** Options for `users.getLeagues()` and `users.getDrafts()`. */
export interface SeasonOptions extends SportOptions {
  /** The season to list. */
  season: Season;
}

/** Options for `players.getAll()`. Filtered responses are much smaller. */
export interface PlayersOptions extends SportOptions {
  /**
   * Only return players whose `fantasy_positions` include this position
   * (e.g. `'QB'`, `'DEF'`). Case-sensitive: `'qb'` matches nothing.
   */
  position?: string;
  /** Set to `true` to only return active players. `false` is the same as leaving it out. */
  active?: boolean;
}

/** Direction of a trending players query. */
export type TrendingType = 'add' | 'drop';

/** Options for `players.getTrending()`. */
export interface TrendingPlayersOptions extends SportOptions {
  /** Hours to look back, a positive integer. Sleeper defaults to `24` and caps it at `168`. */
  lookbackHours?: number;
  /** Players to return, a positive integer. Sleeper defaults to `25` and caps it at `100`. */
  limit?: number;
}

// ─── Value Sets ──────────────────────────────────────────────────────────────
// Open unions: the listed values autocomplete, and any other string Sleeper
// adds later still type-checks.

/** `League.status`. */
export type LeagueStatus =
  | 'pre_draft'
  | 'drafting'
  | 'in_season'
  | 'post_season'
  | 'complete'
  | (string & {});

/** `League.season_type`, `Draft.season_type` and `SportState.season_type`. */
export type SeasonType = 'pre' | 'regular' | 'post' | 'off' | (string & {});

/** `Draft.type`. */
export type DraftType = 'snake' | 'linear' | 'auction' | (string & {});

/** `Draft.status`. */
export type DraftStatus = 'pre_draft' | 'drafting' | 'paused' | 'complete' | (string & {});

/** `Transaction.type`. */
export type TransactionType =
  | 'trade'
  | 'free_agent'
  | 'waiver'
  | 'commissioner'
  | 'chopped'
  | (string & {});

/** `Transaction.status`. */
export type TransactionStatus = 'complete' | 'failed' | 'pending' | (string & {});

// ─── API Response Types ──────────────────────────────────────────────────────

/** League-wide settings. Every value is an integer; common keys are typed. */
export interface LeagueSettings {
  /**
   * League type: `0` redraft, `1` keeper, `2` dynasty, `3` guillotine. Missing
   * on 2017 leagues.
   */
  type?: number;
  /** Number of teams. */
  num_teams: number;
  /** First playoff week; `0` when the league has no playoffs. */
  playoff_week_start: number;
  /** Number of playoff teams. */
  playoff_teams?: number;
  /** First week of the season. */
  start_week?: number;
  /** Current leg (week). */
  leg: number;
  /** Last leg with final scores. */
  last_scored_leg?: number;
  /** FAAB budget per team. */
  waiver_budget: number;
  /** Trade deadline week. */
  trade_deadline: number;
  /** Injured-reserve slots. Missing on some 2017–2020 leagues. */
  reserve_slots?: number;
  /** Taxi-squad slots. Missing on some 2017–2020 leagues. */
  taxi_slots?: number;
  [key: string]: unknown;
}

/** A Sleeper fantasy league. */
export interface League {
  /** Unique league identifier. */
  league_id: string;
  /** Display name of the league. */
  name: string;
  /** Sport for this league (e.g. `"nfl"`). */
  sport: string;
  /** Season (e.g. `"2024"`). */
  season: string;
  /** Season type (e.g. `"regular"`). */
  season_type: SeasonType;
  /** Current league status. */
  status: LeagueStatus;
  /** League-level settings. */
  settings: LeagueSettings;
  /** Scoring rules mapping stat categories to point values. */
  scoring_settings: Record<string, number>;
  /** Ordered list of roster slot positions (e.g. `["QB", "RB", "RB", "WR", "WR", "FLEX", "BN"]`). */
  roster_positions: string[];
  /** Total number of rosters in the league. */
  total_rosters: number;
  /**
   * League ID of the previous season's league. `null` (or occasionally `"0"`)
   * in a league's first season.
   */
  previous_league_id: string | null;
  /** ID of the league's current draft. */
  draft_id: string;
  /** Avatar image identifier. Pass to {@link avatarUrl} for an image URL. */
  avatar: string | null;
  /** Arbitrary league metadata (string values). */
  metadata: Record<string, unknown> | null;
  /**
   * Winners bracket ID, once playoffs are set up. Sleeper sends it as a 64-bit
   * number; the client returns it as an exact string.
   */
  bracket_id: string | null;
  /** Losers bracket ID, once playoffs are set up. An exact string, like `bracket_id`. */
  loser_bracket_id: string | null;
  /**
   * ID of the league's most recent transaction, as an exact string (compare it
   * with `Transaction.transaction_id`). Only `users.getLeagues()` includes it;
   * `leagues.get()` leaves it out.
   */
  last_transaction_id?: string | null;
}

/** A roster (team) within a league. */
export interface Roster {
  /** Numeric roster identifier, unique within the league. */
  roster_id: number;
  /** User ID of the roster owner. `null` for orphan rosters with no owner. */
  owner_id: string | null;
  /** League this roster belongs to. */
  league_id: string;
  /** All player IDs on this roster. `null` before the draft. */
  players: string[] | null;
  /** Player IDs in starting lineup slots, in slot order. `"0"` marks an empty slot. */
  starters: string[];
  /** Player IDs on the injured reserve. `null` when the slot is unused. */
  reserve: string[] | null;
  /** Player IDs in taxi (rookie) squad slots. `null` when the slot is unused. */
  taxi: string[] | null;
  /** User IDs of co-owners. */
  co_owners: string[] | null;
  /** Player IDs kept from the previous season. */
  keepers: string[] | null;
  /** Record and scoring totals for this roster. */
  settings: {
    /** Total wins. */
    wins: number;
    /** Total losses. */
    losses: number;
    /** Total ties. */
    ties: number;
    /** Fantasy points scored, whole points. Total is `fpts + fpts_decimal / 100`. */
    fpts: number;
    /** Fantasy points scored, hundredths of a point (0–99). */
    fpts_decimal?: number;
    /** Fantasy points scored against, whole points. */
    fpts_against?: number;
    /** Fantasy points scored against, hundredths of a point (0–99). */
    fpts_against_decimal?: number;
    /** Maximum possible points, whole points. */
    ppts?: number;
    /** Maximum possible points, hundredths of a point (0–99). */
    ppts_decimal?: number;
    /** Current waiver priority. */
    waiver_position?: number;
    /** FAAB spent this season. */
    waiver_budget_used?: number;
    /** Number of roster moves made. */
    total_moves?: number;
    [key: string]: unknown;
  };
  /** Arbitrary metadata attached to this roster. */
  metadata: Record<string, unknown> | null;
}

/** A Sleeper user account, as returned by `users.get()`. */
export interface User {
  /** Unique user identifier. */
  user_id: string;
  /**
   * Login username. Usernames can change, so store `user_id`. A deleted
   * account keeps a placeholder such as `"deleted-70wbn63kyjjg"`.
   */
  username: string | null;
  /** User's chosen display name. A deleted account shows `"DELETED-…"`. */
  display_name: string | null;
  /** Avatar image identifier. Pass to {@link avatarUrl} for an image URL. */
  avatar: string | null;
  /** Whether this account is a bot. */
  is_bot: boolean | null;
}

/** A member of a league, as returned by `leagues.getUsers()`. Has no `username`. */
export interface LeagueUser {
  /** Unique user identifier. */
  user_id: string;
  /** League this record belongs to. */
  league_id: string;
  /** User's chosen display name. A deleted account shows `"DELETED-…"`. */
  display_name: string | null;
  /** Avatar image identifier. Pass to {@link avatarUrl} for an image URL. */
  avatar: string | null;
  /** Whether this user is a commissioner of the league (a league can have several). */
  is_owner: boolean | null;
  /** Whether this account is a bot. `null` for some older accounts. */
  is_bot: boolean | null;
  /**
   * League-specific settings (string values). `team_name` is the team's name;
   * `avatar` is a full image URL for a custom team avatar, not an avatar ID.
   */
  metadata: { team_name?: string; avatar?: string; [key: string]: unknown };
}

/**
 * A player in the Sleeper database.
 *
 * Field types were checked against the live NFL player list. Most fields are
 * `null` for some entries (team defenses, retired or unsigned players).
 */
export interface Player {
  /** Unique player identifier. Team defenses use the team abbreviation (e.g. `"KC"`). */
  player_id: string;
  /** Player's first name. */
  first_name: string | null;
  /** Player's last name. */
  last_name: string | null;
  /** Player's full name. */
  full_name?: string | null;
  /** Primary position (e.g. `"QB"`, `"RB"`, `"WR"`). `null` for unknown or non-roster entries. */
  position: string | null;
  /** Team abbreviation (e.g. `"KC"` for the NFL, `"LAL"` for the NBA). `null` for free agents. */
  team: string | null;
  /** Player status (e.g. `"Active"`, `"Inactive"`). Missing for team defenses; sometimes `null`. */
  status?: string | null;
  /** Whether the player is active. */
  active: boolean;
  /** Player's age. */
  age?: number | null;
  /** Date of birth (`YYYY-MM-DD`). */
  birth_date?: string | null;
  /**
   * Height as free-form text: usually inches (`"74"`), sometimes feet and
   * inches (`"6'2\""`), and sometimes `""`.
   */
  height?: string | null;
  /** Weight in pounds as free-form text (e.g. `"215"`); sometimes `""`. */
  weight?: string | null;
  /** Years of professional experience. */
  years_exp?: number | null;
  /** College attended. */
  college?: string | null;
  /** High school attended. */
  high_school?: string | null;
  /** City of birth. */
  birth_city?: string | null;
  /** State or province of birth. */
  birth_state?: string | null;
  /** Jersey number. */
  number?: number | null;
  /** Current injury status (e.g. `"Questionable"`, `"Out"`, `"IR"`). `null` when healthy. */
  injury_status: string | null;
  /** Injured body part. */
  injury_body_part?: string | null;
  /** Free-text injury notes. */
  injury_notes?: string | null;
  /** Date the current injury started. */
  injury_start_date?: string | null;
  /** Practice participation status. */
  practice_participation?: string | null;
  /** Practice participation description. */
  practice_description?: string | null;
  /** Sport this player belongs to. */
  sport: string;
  /** Eligible fantasy positions. The `position` filter of `players.getAll()` matches these. */
  fantasy_positions: string[] | null;
  /** Depth chart position (e.g. `"LWR"`, `"QB"`). */
  depth_chart_position?: string | null;
  /** Order within the depth chart position. */
  depth_chart_order?: number | null;
  /** Normalized first name for search. */
  search_first_name?: string | null;
  /** Normalized last name for search. */
  search_last_name?: string | null;
  /** Normalized full name for search. */
  search_full_name?: string | null;
  /** Search ranking value. */
  search_rank?: number | null;
  /** Player hashtag identifier. */
  hashtag?: string;
  /** Unix timestamp (ms) of the latest news update. */
  news_updated?: number | null;
  /** Sportradar external ID. */
  sportradar_id?: string | null;
  /** NFL GSIS external ID. */
  gsis_id?: string | null;
  /** Stats Inc external ID. */
  stats_id?: number | null;
  /** FantasyData external ID. */
  fantasy_data_id?: number | null;
  /** ESPN external ID. */
  espn_id?: number | null;
  /** Yahoo external ID. */
  yahoo_id?: number | null;
  /** RotoWire external ID. */
  rotowire_id?: number | null;
  /** RotoWorld external ID. */
  rotoworld_id?: number | null;
  /** SwishAnalytics external ID. */
  swish_id?: number | null;
  /** Kalshi external ID. */
  kalshi_id?: string | null;
  /** OddsJam external ID. */
  oddsjam_id?: string | null;
  /** PandaScore external ID (esports players). */
  pandascore_id?: number | null;
  /** Team abbreviation as shown in some contexts; usually `null`, use `team`. */
  team_abbr?: string | null;
  /** Competitions the player is entered in. */
  competitions?: unknown[];
  /** Country of birth. */
  birth_country?: string | null;
  /** Arbitrary metadata attached to this player. */
  metadata?: Record<string, unknown> | null;
}

/** A map of player IDs to {@link Player} objects, as returned by the all-players endpoint. */
export type PlayersMap = Record<string, Player>;

/** A single roster's scoring result within a weekly matchup. */
export interface Matchup {
  /** Roster ID for this side of the matchup. */
  roster_id: number;
  /**
   * Matchup pairing identifier. Two rosters sharing the same `matchup_id` are
   * opponents. `null` when the roster has no matchup that week (e.g. eliminated
   * from the playoffs).
   */
  matchup_id: number | null;
  /** Total fantasy points scored. */
  points: number;
  /** All player IDs that were on the roster for this matchup. `null` when there is no lineup. */
  players: string[] | null;
  /**
   * Player IDs in starting lineup slots, in slot order. `"0"` marks an empty
   * slot; `null` when there is no lineup.
   */
  starters: string[] | null;
  /** Points per starter, in the same order as `starters`. */
  starters_points: number[];
  /** Points per player ID, for every player in `players`. */
  players_points: Record<string, number>;
  /** Commissioner-assigned custom point total. `null` when not overridden. */
  custom_points: number | null;
}

/** Draft settings. Common keys are typed; slot counts are `slots_<position>`. */
export interface DraftSettings {
  /** Number of rounds. */
  rounds: number;
  /** Number of teams. */
  teams: number;
  /**
   * Seconds per pick. Missing on some older drafts. `users.getDrafts()` caps
   * it at 32767; the other endpoints return the real value.
   */
  pick_timer?: number;
  /** Auction budget per team (auction drafts only). */
  budget?: number;
  [key: string]: unknown;
}

/** A fantasy draft. */
export interface Draft {
  /** Unique draft identifier. */
  draft_id: string;
  /** League this draft belongs to. */
  league_id: string;
  /** Draft format. */
  type: DraftType;
  /** Draft status. */
  status: DraftStatus;
  /** Sport for this draft. */
  sport: string;
  /** Season. */
  season: string;
  /** Season type. */
  season_type: SeasonType;
  /** Scheduled start time (Unix ms). `null` before it is scheduled. */
  start_time: number | null;
  /** Draft-level settings. */
  settings: DraftSettings;
  /** Draft metadata (string values such as `name`, `description`, `scoring_type`). */
  metadata: Record<string, unknown>;
  /**
   * Map of user ID to draft slot number. `null` until the order is set, and
   * always `null` in `users.getDrafts()` results.
   */
  draft_order: Record<string, number> | null;
  /**
   * Map of draft slot to roster ID. Only included by `drafts.get()`; the list
   * endpoints leave it out. Slots without a roster map to `null`.
   */
  slot_to_roster_id?: Record<string, number | null> | null;
  /** Time of the most recent pick (Unix ms). `null` before the first pick. */
  last_picked: number | null;
  /** Time of the most recent chat message (Unix ms). */
  last_message_time: number;
  /** ID of the most recent chat message. */
  last_message_id: string;
  /** User IDs of the draft creators. Always `null` in `users.getDrafts()` results. */
  creators: string[] | null;
  /** When the draft was created (Unix ms). */
  created: number;
}

/**
 * Snapshot of the picked player at pick time (all values are strings).
 * Auction drafts add `amount` (the winning bid) and `slot`.
 */
export interface DraftPickMetadata {
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
  number?: string;
  status?: string;
  injury_status?: string;
  years_exp?: string;
  news_updated?: string;
  /** Winning bid, in auction drafts. */
  amount?: string;
  /** Draft slot of the winning team, in auction drafts. */
  slot?: string;
  [key: string]: unknown;
}

/** A single pick made during a draft. */
export interface DraftPick {
  /** Player ID that was selected. */
  player_id: string;
  /** User ID of the manager who made the pick. `""` for some automatic or commissioner picks. */
  picked_by: string;
  /** Roster ID the pick belongs to. */
  roster_id: number;
  /** Round number (1-indexed). */
  round: number;
  /** Draft slot position within the round. */
  draft_slot: number;
  /** Overall pick number (1-indexed). */
  pick_no: number;
  /** Snapshot of the picked player (and, for auctions, the price). */
  metadata: DraftPickMetadata;
  /** Whether this pick was designated as a keeper. */
  is_keeper: boolean | null;
  /** Draft this pick belongs to. */
  draft_id: string;
  /** Emoji reactions to the pick, by user ID. */
  reactions: Record<string, string[]> | null;
}

/** Transaction settings (waiver claims). */
export interface TransactionSettings {
  /** FAAB bid on a waiver claim. */
  waiver_bid?: number;
  /** Processing sequence number. */
  seq?: number;
  /** Waiver priority used. */
  priority?: number;
  /** On trades: `1` when the trade is a counter-offer. */
  is_counter?: number;
  /** On trades: when the offer expires (Unix ms). */
  expires_at?: number;
  [key: string]: unknown;
}

/** A league transaction (trade, waiver claim, free agent move or commissioner action). */
export interface Transaction {
  /** Unique transaction identifier. */
  transaction_id: string;
  /**
   * Transaction type. `"chopped"` is a guillotine league's weekly cut: the
   * system user (`"166666666666666666"`) drops the whole roster.
   */
  type: TransactionType;
  /** Transaction status. */
  status: TransactionStatus;
  /** Roster IDs involved in this transaction. */
  roster_ids: number[];
  /** Map of player ID to the roster ID that acquired them. `null` if no adds. */
  adds: Record<string, number> | null;
  /** Map of player ID to the roster ID that dropped them. `null` if no drops. */
  drops: Record<string, number> | null;
  /** Draft picks included in a trade. */
  draft_picks: TradedPick[];
  /** FAAB moved between rosters as part of a trade. */
  waiver_budget: WaiverBudgetTransfer[];
  /** Metadata; `notes` explains, for example, why a waiver claim failed. */
  metadata: { notes?: string; [key: string]: unknown } | null;
  /** Settings: the waiver bid on claims, counter-offer and expiry details on some trades. */
  settings: TransactionSettings | null;
  /** User ID of the transaction creator. */
  creator: string;
  /** Roster IDs that consented. `null` for commissioner and chopped transactions. */
  consenter_ids: number[] | null;
  /** The leg (week) this transaction occurred in; equals the requested round. */
  leg: number;
  /** When the status last changed (Unix ms). */
  status_updated: number;
  /** When the transaction was created (Unix ms). */
  created: number;
}

/** FAAB moved from one roster to another in a trade. */
export interface WaiverBudgetTransfer {
  /** Roster ID giving the budget. */
  sender: number;
  /** Roster ID receiving the budget. */
  receiver: number;
  /** Amount of FAAB moved. */
  amount: number;
}

/** A draft pick that has been traded between rosters. */
export interface TradedPick {
  /** Season the pick is for. */
  season: string;
  /** Round number of the pick. */
  round: number;
  /** Roster ID the pick originally belonged to. */
  roster_id: number;
  /** Roster ID of the previous owner. */
  previous_owner_id: number;
  /** Roster ID of the current owner. */
  owner_id: number;
  /** League ID. Present (usually `null`) on picks inside `Transaction.draft_picks`. */
  league_id?: string | null;
  /** Draft ID, as an exact string. Present on most `drafts.getTradedPicks()` results. */
  draft_id?: string;
}

/** Where a bracket slot's team comes from: the winner or loser of an earlier match. */
export interface BracketSource {
  /** Match ID whose winner advances here. */
  w?: number;
  /** Match ID whose loser advances here. */
  l?: number;
}

/** A single matchup within a playoff bracket. */
export interface BracketMatchup {
  /** Round number. */
  r: number;
  /** Match identifier, unique within the bracket. */
  m: number;
  /** Roster ID of team 1. `null` until it is decided. */
  t1: number | null;
  /** Roster ID of team 2. `null` until it is decided. */
  t2: number | null;
  /** Source of team 1 when it comes from an earlier match. */
  t1_from?: BracketSource | null;
  /** Source of team 2 when it comes from an earlier match. */
  t2_from?: BracketSource | null;
  /** Roster ID of the match winner. `null` until played. */
  w: number | null;
  /** Roster ID of the match loser. `null` until played. */
  l: number | null;
  /** Final placement this match decides (e.g. `1` for the championship, `3` for third place). */
  p?: number | null;
}

/**
 * Current state of a sport on Sleeper (season, week, etc.).
 *
 * NFL, NBA and LCS return every field. Other sports return fewer: NHL omits
 * `leg`, `league_season` and `league_create_season`, WNBA returns only the
 * first five fields below, and MLB sends `previous_season` as a number.
 */
export interface SportState {
  /** Current week number. */
  week: number;
  /** Season type. */
  season_type: SeasonType;
  /** Current season year. */
  season: string;
  /** Start date of the regular season (`YYYY-MM-DD`). `null` in the off-season for some sports. */
  season_start_date: string | null;
  /** Whether games in the current season have produced scores yet. */
  season_has_scores?: boolean;
  /** Previous season year. A number for some sports (e.g. MLB). */
  previous_season?: string | number;
  /** Current leg (week) for transactions and waivers. */
  leg?: number;
  /** Active season for leagues. */
  league_season?: string;
  /** Season new leagues are created in (flips in December for the NFL). */
  league_create_season?: string;
  /** Week to show in a UI; can differ from `week`. */
  display_week?: number;
  [key: string]: unknown;
}

/** A player appearing in a trending adds or drops list. */
export interface TrendingPlayer {
  /** Player ID. */
  player_id: string;
  /** Number of adds or drops in the lookback window. */
  count: number;
}
