# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-16

First public release.

### Added

- **`SleeperClient`** covering every read endpoint of the Sleeper API, grouped by namespace:
  - `users`: `get`, `getLeagues`, `getDrafts`;
  - `leagues`: `get`, `getRosters`, `getUsers`, `getMatchups`, `getWinnersBracket`, `getLosersBracket`, `getTransactions`, `getTradedPicks`, `getDrafts`;
  - `drafts`: `get`, `getPicks`, `getTradedPicks`;
  - `players`: `getAll` (with `position` and `active` filters) and `getTrending`;
  - `state`: `get`.
- **Calling conventions:** identifiers are positional, and every optional setting (including `sport`, which defaults to `'nfl'`) goes in one trailing options object together with the per-call `signal` and `timeoutMs`. Every method returns a promise, and invalid arguments reject it.
- **Client options:**
  - `baseUrl`;
  - `rateLimitMs`, which starts requests at least that far apart, in the order they were made;
  - `timeoutMs`, which aborts a request that runs too long, measured from dispatch;
  - `fetch`, to inject the `fetch` implementation;
  - `headers`, sent with every request.
- **Errors:** `SleeperError` and its subclasses `SleeperApiError` (status, body, headers and a parsed `retryAfterMs`), `SleeperNetworkError`, `SleeperTimeoutError` and `SleeperParseError`. Every request error carries the request URL. Invalid arguments reject with `RangeError` or `TypeError`, and a cancelled call rejects with `signal.reason`.
- **Sleeper quirks, normalised:**
  - a `200` with a `null` body (an unknown user or sport) is a `404` `SleeperApiError`;
  - a league with no playoff bracket gets `[]` from the bracket methods;
  - 64-bit IDs that Sleeper sends as JSON numbers are returned as exact strings.
- **Path safety:** IDs are percent-encoded into a single path segment, and empty, `.` and `..` IDs are rejected.
- **Types** for every response, checked against live API data from 2017–2026 NFL, NBA and LCS leagues:
  - `League`, `LeagueSettings`, `Roster`, `User`, `LeagueUser`, `Player`, `PlayersMap`, `Matchup`, `Draft`, `DraftSettings`, `DraftPick`, `DraftPickMetadata`, `Transaction`, `TransactionSettings`, `WaiverBudgetTransfer`, `TradedPick`, `BracketMatchup`, `BracketSource`, `SportState` and `TrendingPlayer`;
  - open-union value sets `Sport`, `Season`, `LeagueStatus`, `SeasonType`, `DraftType`, `DraftStatus`, `TransactionType`, `TransactionStatus` and `TrendingType`;
  - option types, and a type for each namespace (`LeagueNamespace` and friends).
- **Avatar helpers:** `avatarUrl()` and `avatarThumbnailUrl()`.
- **Package:** ESM-only, zero dependencies, Node.js 22.12 or later, published to npm with provenance.

[Unreleased]: https://github.com/curtislabs/sleeper-ts/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/curtislabs/sleeper-ts/releases/tag/v0.3.0
