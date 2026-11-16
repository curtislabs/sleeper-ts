export { SleeperClient } from './client.js';
export { avatarUrl, avatarThumbnailUrl } from './avatars.js';
export {
  SleeperError,
  SleeperApiError,
  SleeperParseError,
  SleeperNetworkError,
  SleeperTimeoutError,
} from './errors.js';
export type { SleeperApiErrorOptions } from './errors.js';

export type {
  SleeperClientOptions,
  FetchFunction,
  RequestOptions,
  Sport,
  Season,
  SportOptions,
  SeasonOptions,
  PlayersOptions,
  TrendingType,
  TrendingPlayersOptions,
  LeagueStatus,
  SeasonType,
  DraftType,
  DraftStatus,
  TransactionType,
  TransactionStatus,
  League,
  LeagueSettings,
  Roster,
  User,
  LeagueUser,
  Player,
  PlayersMap,
  Matchup,
  Draft,
  DraftSettings,
  DraftPick,
  DraftPickMetadata,
  Transaction,
  TransactionSettings,
  WaiverBudgetTransfer,
  TradedPick,
  BracketMatchup,
  BracketSource,
  SportState,
  TrendingPlayer,
} from './types.js';

import type { SleeperClient } from './client.js';

// The namespace classes are internal; these aliases name their instance types
// (for example to type a parameter) without implying a runtime export.
/** The type of {@link SleeperClient.leagues}. */
export type LeagueNamespace = SleeperClient['leagues'];
/** The type of {@link SleeperClient.users}. */
export type UserNamespace = SleeperClient['users'];
/** The type of {@link SleeperClient.players}. */
export type PlayerNamespace = SleeperClient['players'];
/** The type of {@link SleeperClient.drafts}. */
export type DraftNamespace = SleeperClient['drafts'];
/** The type of {@link SleeperClient.state}. */
export type StateNamespace = SleeperClient['state'];
