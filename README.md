# sleeper-ts

A zero-dependency, fully typed TypeScript SDK for the [Sleeper Fantasy Sports API](https://docs.sleeper.com/).

## Installation

```bash
npm install @curtislabs/sleeper-ts
```

**Requirements:**

- **Node.js 22.12 or later.** The package is ESM-only.
  - CommonJS code can still `require()` it. Node 22 prints an `ExperimentalWarning` for that.
  - TypeScript CommonJS projects need a `module` setting that can import ES modules, such as `nodenext` or `node20` (`node16` can't).
- **TypeScript projects need `@types/node`** (or the `DOM` lib) so `AbortSignal`, `Headers`, `RequestInit` and `Response` resolve.

## Quick Start

```typescript
import { SleeperClient } from '@curtislabs/sleeper-ts';

const client = new SleeperClient();

// Get a user
const user = await client.users.get('johndoe');

// Get the user's leagues for the 2024 NFL season
const leagues = await client.users.getLeagues(user.user_id, { season: 2024 });

// Get rosters for a league
const rosters = await client.leagues.getRosters(leagues[0].league_id);

// Get the current NFL state
const state = await client.state.get();
```

## Calling conventions

- **Identifiers are positional; everything else goes in one options object.** IDs, `week`, `round` and the trending `type` come first. Every optional setting, including `sport`, goes in a trailing options object. `sport` always defaults to `'nfl'`.
- **Per-call `signal` and `timeoutMs`** go in that same object (`client.state.get({ sport: 'nba', timeoutMs: 5_000 })`). A method with no other options takes them as its last argument (`client.leagues.get(id, { signal })`).
- **Every method returns a promise.** Invalid arguments reject it rather than throwing synchronously. A plain-JavaScript call with the wrong argument shape, such as `state.get('nba')`, rejects with a `TypeError` instead of requesting the wrong URL.

## Configuration

```typescript
const client = new SleeperClient({
  // Custom base URL (default: https://api.sleeper.app/v1)
  baseUrl: 'https://api.sleeper.app/v1',
  // Minimum delay between the starts of two requests in ms (default: 0, no limit)
  rateLimitMs: 60,
  // Per-request timeout in ms (default: none). The request is aborted, and
  // a SleeperTimeoutError thrown, once the budget runs out.
  timeoutMs: 15_000,
  // Headers sent with every request (default: none)
  headers: { 'User-Agent': 'my-app/1.0' },
  // The fetch to use (default: the global fetch, read at call time)
  fetch: (url, init) => fetch(url, init),
});
```

**`rateLimitMs`:** Sleeper asks clients to stay under about 1,000 calls per minute, or risk having their IP blocked. `rateLimitMs: 60` keeps a single client under that. Calls start in the order they were made.

**`fetch`:** inject a test double, add instrumentation or retries per attempt, or route through a proxy, without touching globals. The client calls it as `fetch(url, { signal, headers? })`.

**Validation:** the constructor throws a `RangeError` for a negative, `NaN` or non-numeric millisecond option, or an infinite `rateLimitMs`. It throws a `TypeError` if `fetch` isn't a function or `headers` isn't an object.

The client keeps no data between calls; its only state is when the next `rateLimitMs` slot is. Sleeper asks clients to download the full player list at most once a day, so store it yourself (see [Players](#clientplayers)).

### Timeouts and cancellation

- **`timeoutMs`** gives each request its own `AbortController`. When the budget runs out the `fetch` is aborted (no socket is left open) and the call rejects with `SleeperTimeoutError`.
- **The budget starts at dispatch.** Time spent waiting for a `rateLimitMs` slot does not count, so a burst of calls does not time out before any of them is sent.
- **Per-call `timeoutMs` overrides the client default.**
  - `0` disables the timeout for that call.
  - Any value above 2,147,483,647 ms (the largest timer delay, about 24.8 days), including `Infinity`, also means no timeout.
- **Aborting `signal` rejects the call with `signal.reason`** (an `AbortError` by default). The exception: if an HTTP error status already arrived and the abort only cut off reading its body, the call rejects with that `SleeperApiError`.
- **A call aborted while it waits for its `rateLimitMs` slot rejects at once.** Its slot is not reused, so the calls after it keep their times.

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 2_000);

const rosters = await client.leagues.getRosters('123', { signal: controller.signal });
const trending = await client.players.getTrending('add', { limit: 10, timeoutMs: 5_000 });
```

The client does not retry failed requests. Use `SleeperApiError.retryAfterMs` (below) if you add your own retries.

## API Reference

### `client.users`

| Method                                               | Description                       |
| ---------------------------------------------------- | --------------------------------- |
| `get(usernameOrId, request?)`                        | Get a user by username or ID      |
| `getLeagues(userId, { season, sport?, ...request })` | Get a user's leagues for a season |
| `getDrafts(userId, { season, sport?, ...request })`  | Get a user's drafts for a season  |

**`season`** takes a year (`2024` or `'2024'`) or a split-season name such as LCS's `'2023-summer'`. Values read from `League.season`, `Draft.season` or `SportState.season` work as they are.

**`get`** rejects with a 404 `SleeperApiError` for an unknown user. Usernames can change, so store `user_id`. A deleted account keeps placeholder names (`deleted-…` / `DELETED-…`).

**`getDrafts`** returns less than the other draft endpoints: `creators` and `draft_order` are always `null`, and `settings.pick_timer` is capped at 32767.

### `client.leagues`

| Method                                       | Description                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `get(leagueId, request?)`                    | Get a league by ID                                                                                          |
| `getRosters(leagueId, request?)`             | Get all rosters in a league. Before the draft, `players` is `null`; `"0"` in `starters` marks an empty slot |
| `getUsers(leagueId, request?)`               | Get a league's members as `LeagueUser`s (team name in `metadata.team_name`; no `username`)                  |
| `getMatchups(leagueId, week, request?)`      | Get matchups for a given week. Week `0` (the off-season `SportState.week`) resolves to `[]`                 |
| `getWinnersBracket(leagueId, request?)`      | Get the winners bracket; `[]` if the league has no playoff bracket                                          |
| `getLosersBracket(leagueId, request?)`       | Get the losers bracket; `[]` if the league has no playoff bracket                                           |
| `getTransactions(leagueId, round, request?)` | Get transactions for a round (week)                                                                         |
| `getTradedPicks(leagueId, request?)`         | Get traded draft picks                                                                                      |
| `getDrafts(leagueId, request?)`              | Get all drafts for a league                                                                                 |

**Unknown league IDs** behave differently by method:

- `get`, `getRosters`, `getMatchups` and both bracket methods reject with a 404 `SleeperApiError`.
- `getUsers`, `getTransactions`, `getTradedPicks` and `getDrafts` resolve to `[]`, so don't use them to check whether a league exists.

`League.last_transaction_id` is only present in `users.getLeagues()` results.

### `client.drafts`

| Method                              | Description                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `get(draftId, request?)`            | Get a draft by ID. Only this method includes `slot_to_roster_id` |
| `getPicks(draftId, request?)`       | Get all picks in a draft, in pick order                          |
| `getTradedPicks(draftId, request?)` | Get traded picks in a draft                                      |

### `client.players`

| Method                                                              | Description                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| `getAll({ sport?, position?, active?, ...request })`                | Get all players (defaults to NFL), optionally filtered |
| `getTrending(type, { sport?, lookbackHours?, limit?, ...request })` | Get trending adds or drops                             |

`getAll()` downloads every player in a sport, which is about 15 MB of JSON for the NFL. Sleeper asks clients to fetch it at most once a day and store it themselves. If you only need some players, filter on the server:

```typescript
const qbs = await client.players.getAll({ position: 'QB' }); // ~0.6 MB
const activeQbs = await client.players.getAll({ position: 'QB', active: true });
```

**Filters:**

- `position` matches any of a player's `fantasy_positions` and is case-sensitive: `'QB'` works, `'qb'` returns nothing. An unknown position returns an empty map.
- `active: true` returns only active players. `active: false` is the same as leaving it out.

```typescript
// Most-dropped NBA players over the last 48 hours
const trending = await client.players.getTrending('drop', {
  sport: 'nba',
  lookbackHours: 48,
  limit: 10,
});
```

**Trending limits:** `lookbackHours` defaults to 24 and `limit` to 25. Both must be positive integers; anything else rejects with a `RangeError`. Sleeper caps them at 168 and 100.

### `client.state`

| Method                        | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `get({ sport?, ...request })` | Get the current sport state (week, season, etc.) |

NFL, NBA and LCS return every `SportState` field; other sports return fewer.

### Avatars

`avatarUrl(avatarId)` and `avatarThumbnailUrl(avatarId)` build `sleepercdn.com` image URLs from the `avatar` field of a `User`, `LeagueUser` or `League`. They throw a `RangeError` for an empty, `.` or `..` ID. A custom team avatar in `LeagueUser.metadata.avatar` is already a full URL.

```typescript
import { avatarUrl } from '@curtislabs/sleeper-ts';

if (user.avatar) img.src = avatarUrl(user.avatar);
```

## Error Handling

```typescript
import {
  SleeperClient,
  SleeperApiError,
  SleeperNetworkError,
  SleeperParseError,
  SleeperTimeoutError,
} from '@curtislabs/sleeper-ts';

const client = new SleeperClient();

try {
  const user = await client.users.get('nonexistent');
} catch (error) {
  if (error instanceof SleeperApiError) {
    console.error(error.status); // 404
    console.error(error.statusText); // "Not Found"
    console.error(error.url); // request URL
    console.error(error.body); // response body (if any)
    console.error(error.retryAfterMs); // parsed Retry-After in ms (if sent)
    console.error(error.headers); // response headers
  } else if (error instanceof SleeperTimeoutError) {
    // Check before SleeperNetworkError: SleeperTimeoutError extends it.
    console.error(error.timeoutMs); // the budget that was exceeded
    console.error(error.url); // request URL
  } else if (error instanceof SleeperNetworkError) {
    console.error(error.message); // "Failed to fetch ..."
    console.error(error.cause); // underlying error
  } else if (error instanceof SleeperParseError) {
    console.error(error.body); // start of the body that was not valid JSON
  }
}
```

**Every failed request** (HTTP error, network failure, timeout or unparseable body) rejects with a `SleeperError` subclass carrying the request `url`. Three kinds of failure are not `SleeperError`s:

- **A wrong argument shape** from plain JavaScript (such as `state.get('nba')`) is a `TypeError`.
- **An invalid value** (a negative `timeoutMs`, a week of `1.5`, an ID of `..`) is a `RangeError`.
- **A call you cancel** through its `signal` rejects with `signal.reason`, an `AbortError` `DOMException` by default.

Endpoint methods report the first two as rejected promises. `new SleeperClient()` and the avatar helpers throw them synchronously.

**`retryAfterMs`** is the `Retry-After` header in milliseconds. It accepts delta-seconds and the standard HTTP date (`Sun, 06 Nov 1994 08:49:37 GMT`), and is capped at about 24.8 days. Error bodies (`SleeperApiError.body`, `SleeperParseError.body`) keep the first 1,000 characters.

**`null` bodies.** Sleeper answers some lookups with `200` and a `null` body:

- For an unknown username or user ID, or an unknown sport's state, the client reports a `SleeperApiError` with `status` `404`, the same as an unknown league or draft.
- For a league without a playoff bracket, the bracket methods resolve to `[]`.

**Large IDs.** Sleeper sends a few 64-bit IDs as JSON numbers, which plain `JSON.parse` would round: `League.bracket_id`, `loser_bracket_id` and `last_transaction_id`, and `draft_id` on draft traded picks. The client returns any integer too large for a JavaScript number as its exact string. Floats stay numbers.

## Types

All response, option and value-set types are exported:

```typescript
import type {
  // Responses
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
  // Value sets (open unions: listed values autocomplete, new ones still type-check)
  Sport,
  Season,
  LeagueStatus,
  SeasonType,
  DraftType,
  DraftStatus,
  TransactionType,
  TransactionStatus,
  TrendingType,
  // Options
  SleeperClientOptions,
  FetchFunction,
  RequestOptions,
  SportOptions,
  SeasonOptions,
  PlayersOptions,
  TrendingPlayersOptions,
  SleeperApiErrorOptions,
  // The type of each client.<namespace>
  LeagueNamespace,
  UserNamespace,
  PlayerNamespace,
  DraftNamespace,
  StateNamespace,
} from '@curtislabs/sleeper-ts';
```

## Releasing

Releases are published to npm by CI. To release, bump `version` in `package.json` (for example with `npm version minor --no-git-tag-version`), add the version to `CHANGELOG.md`, and merge to `main`. CI then:

1. sees that the version isn't on npm yet;
2. publishes it with provenance;
3. pushes a `v<version>` tag.

CI authenticates with npm trusted publishing, so no npm token is stored in GitHub. One-time setup:

1. **Create the npm organization** `curtislabs` on npmjs.com, so the `@curtislabs` scope is yours.
2. **Publish the first version from your machine:** `npm login`, then `npm publish --provenance=false`. npm can only attach a trusted publisher to a package that already exists. Provenance can only be generated in CI, so this one manual publish turns it off. `prepublishOnly` builds `dist/` first.
3. **Add the trusted publisher.** On the package's settings page on npmjs.com, add a GitHub Actions trusted publisher for this repository with the workflow file `ci.yml`.

## License

MIT
