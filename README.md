# Bug Bully — Vibecoded Bughouse Replay & Analysis

Bug Bully loads completed Chess.com bughouse matches into an interactive two-board
viewer. Replay the original game, explore alternative lines, inspect engine
suggestions, and keep a local library of games for later analysis.

The project runs as a Next.js web application or a packaged Windows Electron app.
The current package version is **2.7.3**. It is a development fork of
[Ellipsoul/bughouse-chess](https://github.com/Ellipsoul/bughouse-chess), formerly
branded Relay. Bug Bully is independent of Chess.com.

## Start locally

Use Node.js **22.12 or newer** and npm. Node.js 24 was used for the current desktop
build. From the repository root:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Basic game loading, local game storage, and local
engine analysis do not require Firebase credentials. New Chess.com downloads
require internet access.

On Windows, `Start-Bug-Bully.bat` starts the development server at
`http://127.0.0.1:5000`. The older `Start-Relay.bat` forwards to that launcher for
compatibility with existing shortcuts. Install dependencies before using either.

## Using the viewer

### Load games and find opponents' games

- Enter a Chess.com live-game ID or paste a supported Chess.com game URL. Direct
  viewer links accept `?gameId=<id>`; the legacy `gameid` spelling remains supported.
- The viewer loads the partner board automatically when available. Completed
  bughouse games are the supported input; other variants are rejected.
- **Find player games** searches a username's public archives, newest first.
  The requested count defaults to **1**, with a range of **1–500**.
- **Exclude one-move games** starts checked. Unchecking or rechecking it saves
  that choice locally for subsequent searches and browser/app sessions on the
  same origin.
- The filter currently skips a match only when **both boards have at most two
  half-moves**—neither board reaches move 2. Unknown move counts are retained.
  Excluding a match whenever *either* board is short is a proposed collection
  rule, not the current search implementation.
- Search results show players, dates, results, time controls, and both board IDs.
  Filter the list and choose **Load** to analyze a result.
- Every accepted search result is automatically added to **Saved Games**, even
  if it has never been opened. Save failures are reported in the search dialog.
- Loading a search result puts the searched player and their partner at the
  bottom of their respective boards. Saved Games also prefers the searched
  player's board as the first board when that username has been retained.
  Manual flip and board-order controls remain available.

**Save list** exports a versioned JSON list of game IDs and display metadata.
**Open list** restores that list in the search dialog. These lists are not PGN
files or backups of complete offline games. Opening a list alone does not fetch
and save every listed game's full data.

### Replay and explore sidelines

Both boards share a merged move timeline. Step through moves, use timestamp-based
live replay, or enter moves directly to branch into a sideline. Captures transfer
pieces to the partner's reserve; reserve pieces can be clicked or dragged onto a
board. Promotion choices, nested variations, variation promotion, and truncation
are supported.

Other viewer controls include board flipping, swapping left/right boards,
annotations, and desktop fullscreen where supported. Dialog backdrops dismiss
popups through their existing close/cancel actions; active save/delete operations
can temporarily prevent dismissal.

Clocks remain **white above 20 seconds** and turn **red at 20 seconds or less**.
They follow the recorded timeline and freeze at the mainline anchor while
exploring a variation; they are not simulated clocks for newly entered moves.

| Shortcut | Action |
| --- | --- |
| Left / Right | Previous / next move; seek during live replay |
| Up / Down | Jump to the start / end outside a variation picker |
| Space | Toggle live replay when available |
| F | Flip the boards |
| S | Swap left/right board order |
| Escape | Cancel a pending drop, promotion, or variation selection |

The variation picker uses Up/Down to choose, Enter/Right to accept, and
Escape/Left to cancel. Text fields and focused controls retain their own keyboard
behavior.

### Fairy-Stockfish analysis

Enable **Fairy Stockfish** to analyze the current positions. Engine files and the
Crazyhouse NNUE network are bundled under `public/engine/fairy/`; searches run
locally in WebAssembly. **Engine arrows** independently shows or hides the arrows
on both boards while evaluations continue.

Player evaluation labels and board evaluation bars follow the current analysis
node, including sidelines. Player labels express the score from that player's
color perspective. Old-position results are hidden when the cursor changes and
late results are ignored.

In a sideline, **After a partner capture** shows conditional continuations when
an immediate legal capture on the other board can supply a piece. Choosing a
capture adds that legal move to the analysis tree, after which the receiving
player can use the piece normally. These notices stay hidden on the analysis tree's current
mainline.

This is a **single-board Crazyhouse engine integration with partner-capture
lookahead**, not a joint four-player bughouse search. Normal searches use three
candidate lines at depth 11; conditional supply searches are additionally bounded
to 750 ms. Conditional receiving-board scores do not evaluate the complete
strategic cost of the partner's capture. The engine requires browser WebAssembly
support and the bundled WASM/network files.

### Capture-material counters

Small signed numbers near the player bars track material gained or lost through
captures on that board. Hover or keyboard-focus the adjacent information icon for
an explanation. Drops do not change these totals, and captured promoted pieces
count as pawns. These counters are separate from engine evaluations.

Settings offers these piece-value presets:

| Preset | Pawn | Knight | Bishop | Rook | Queen |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bughouse, default | 1.5 | 3 | 3 | 4 | 7 |
| Standard | 1 | 3 | 3 | 5 | 9 |

### Saved Games and storage

**Saved Games** lists local game payloads, supports player search, and opens games
back into the viewer. Select individual checkboxes or use the bold **Select All**
toggle, which applies to the currently visible results. Selections outside the
filter remain selected. **Delete selected** requires confirmation; failed
removals remain available to retry. Single-game deletion is also available.

IndexedDB stores **one complete record per match**, with small lookup entries for
both board IDs. Either ID can load its board as the original board without
storing another full copy. Deleting a match removes its record and both lookups.
The version-2 database upgrade automatically consolidates older reverse and
incomplete records. Migration is transactional: a failed upgrade retains the old
saves. Close other app tabs/windows if an older connection blocks the upgrade.

Storage is local to the browser profile and **origin, including its port**.
`localhost:3000` and `127.0.0.1:5000` have separate libraries. The Electron launcher
currently selects a free port at startup, so its origin can change between
launches and previously saved games/preferences may not appear in a later
session. A fixed development URL avoids that port change. This is a current
limitation, not a completed cross-origin storage migration.

Saved Games caches source-game data, not the interactive variation tree or board
annotations. Clearing browser site data removes that origin's library. Full
cached matches can still be replayed when Chess.com requests fail or the device
is offline, provided the application and its local assets are available; a web manifest alone does not cache the entire
website for offline startup.

## Other application pages

### Match discovery and shared games

The viewer can discover subsequent games for the same four players or a selected
partner pair. Match navigation preserves the chosen team perspective across
color changes. An optional preference advances live replay through a discovered
series.

With Firebase configured, users can sign in with Google, reserve an application
username, share source games/matches, browse `/shared-games`, and manage their
own shares. Shared links use `?sharedId=<id>` and can include a position via `ply`.
The app generates branded game/share preview images. Sharing a source game is
not an export of the current sideline tree.

### Opening explorer

`/opening-explorer` is an existing frontend for a separate opening-data service.
It offers position neighborhoods, continuation frequencies/results, a played
line, player/color filtering, and links to source games. It does **not** build
its dataset from the local Saved Games library.

The reader service and packed datasets belong to the separate
`bughouse-opening-explorer` project. `npm run dev` does not start that service.
Without a configured reader, the page shows an unavailable state.

| Server setting | Purpose |
| --- | --- |
| `OPENING_EXPLORER_SERVICE_URL` | Reader origin; defaults to `http://127.0.0.1:8765` |
| `OPENING_EXPLORER_SERVICE_ALLOWED_ORIGINS` | Exact permitted HTTPS origins for hosted access |
| `OPENING_EXPLORER_SERVICE_TOKEN` | Bearer token for hosted access; server-only |
| `OPENING_EXPLORER_SERVICE_TIMEOUT_MS` | Request timeout; defaults to 45,000 ms |

Loopback HTTP is accepted only outside production. Hosted production access
requires HTTPS, an allowlisted origin, and a token. See
[data and service boundaries](docs/data-and-services.md#opening-service).

### Player Insights

`/player-insights` reads checked-in JSON projections in `app/data/`, including
material totals, king-height analysis, piece-drop heatmaps, and material game
highs. These are build assets, not statistics calculated from the user's local
library. Acquisition, SQLite snapshots, and projection generation belong to the
separate data project.

For a data refresh, run the sibling repository's validated monthly-refresh or
projection-export workflow with this checkout's `app/data/` as the destination.
For example, from that repository's configured Python environment:

```sh
.venv/bin/python scripts/run_monthly_refresh.py \
  --frontend-data-dir /path/to/this-checkout/app/data \
  --publish
```

Here `--publish` replaces generated frontend projection files; it does not deploy
the application. Review snapshot metadata and checksums before committing the
resulting JSON; do not hand-edit projection counts. The frontend repository does
not include those Python exporters. See [Player Insights data boundaries](docs/data-and-services.md#player-insights-projections).

## Windows desktop build

From a Windows checkout with dependencies installed:

```sh
npm run desktop:pack
```

This builds Next.js in standalone mode, stages its server and assets, and creates
an x64 NSIS installer:

```text
dist/Bug-Bully-Setup-2.7.3.exe
```

`npm run desktop:dir` creates the unpacked application under `dist/win-unpacked/`.
`npm run desktop:stage` only stages an already completed standalone build.
The packaged app runs its own local server; users do not need a separate Node.js
installation. Desktop and Start-menu shortcuts use **Bug Bully**. The current
build does not configure a code-signing certificate.

Build outputs, `.desktop-stage`, local runtime/cache directories, and dependencies
are ignored by Git. Rebuilding an installer does not install it or update an
already running app. Browser metadata also supplies the Bug Bully name for
installable-web-app entry points.

## Firebase / Firestore setup (local + production)

<a id="firebase--firestore-setup-local--production"></a>

Firebase is optional for core local analysis. Account, cloud-sharing, preference
sync, analytics, and global load metrics use it when configured. Create a Firebase
project and web app, enable Google authentication, authorize the development or
deployment host, and supply the client fields in a local `.env.local`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your-web-app-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` enables the Analytics configuration;
`NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` supplies the optional reCAPTCHA site key.
For server-side Firestore reads and metrics, also configure:

```dotenv
FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="your-service-account-key-with-escaped-newlines"
```

Keep the service-account credentials server-only and out of Git. Client Firebase
configuration identifies the web app; it is not a replacement for Firestore rules.
The repository includes `firebase.json`, `firestore.rules`, and
`firestore.indexes.json`. Review the target project before deployment:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

`NEXT_PUBLIC_SITE_URL` sets the public origin used for metadata and share URLs.
Client configuration is embedded at build time, so configure it before building
an installer or production web bundle.

Local emulator runs can instead use a `demo-` project with
`FIRESTORE_EMULATOR_HOST`, `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST`, and
`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`. See the exact setup and collection
contracts in [data and services](docs/data-and-services.md) and
[test environment notes](tests/env/README.md).

## Development and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development web server |
| `npm run build` | Production standalone build |
| `npm start` | Start the built production web app |
| `npm run lint` | TypeScript check followed by repository-wide ESLint |
| `npm run format` | ESLint autofix; changes files |
| `npm run test:unit` | Vitest unit, hook, route, UI, and IndexedDB tests |
| `npm run test:component` | Cypress component tests with Firebase emulators |
| `npm run test:e2e` | Cypress E2E tests with emulators and a dev server |
| `npm test` | Unit and component suites |
| `npm run test:all` | Unit, component, and E2E suites |

The Cypress shell runner requires Bash, Java for the Firebase emulators, `curl`,
`lsof`, and an installed Cypress binary. On Windows, use an environment providing
those tools; the ordinary npm unit/build commands can run from PowerShell.
Recorded fixtures keep normal tests separate from live Chess.com acquisition.
`fake-indexeddb` tests cover storage migration, rollback, lookup, and deletion.

**Recorded validation, 2026-11-08:** the full unit run reported **630 passes and
three failures**: two outdated styling assertions in
`tests/unit/components/ChessTitleBadge.test.tsx` and a missing router context in
`tests/unit/components/Sidebar.test.tsx`. The latest production/Windows package
build and packaged-server startup check passed. This is a dated checkpoint, not
a claim that every test or lint check is currently green.

Fixture acquisition commands access Chess.com and write JSON under
`tests/fixtures/chesscom/`:

```sh
npm run fixtures:record -- GAME_ID
npm run fixtures:record:match -- GAME_ID
```

The `migration:shared-games-*` npm scripts are separate Firebase maintenance
tools, not the IndexedDB upgrade. They default to dry runs; review their source
and target project before enabling writes. See [development notes](docs/development.md).

## Code map

| Location | Responsibility |
| --- | --- |
| `app/components/viewer/` | Game loading, two-board analysis/replay, player search |
| `app/components/modals/SavedGamesModal.tsx` | Local library, selection, deletion |
| `app/components/moves/useAnalysisState.ts` | Analysis tree, cursor, variations |
| `app/utils/analysis/` | Legal moves/drops, captures, clocks, replay helpers |
| `app/utils/engine/` | Fairy-Stockfish adapter and partner-capture options |
| `app/utils/offlineGameStore.ts` | IndexedDB match records, board-ID index, migration |
| `app/actions.ts` | Chess.com game/partner/archive requests |
| `app/api/` | Opening-service proxy, shared statistics, metrics, social previews |
| `app/auth/` and `app/utils/platform/` | Firebase integration and platform helpers |
| `electron/` and `scripts/*desktop*` | Desktop launcher and standalone staging |
| `public/engine/fairy/` | Bundled WASM engine, NNUE network, notices |
| `tests/` and `cypress/` | Automated tests and recorded game fixtures |

The stack is Next.js 16, React 19, TypeScript, Tailwind CSS, chess.js,
chessboard.js, MobX, Firebase, and Electron. Existing `relay:*` event/preference
keys, the `relay-offline-games` database name, and some packaging identifiers
remain intentionally unchanged from the old branding.

## Chess.com access and current limitations

Runtime game acquisition uses these GET endpoint patterns:

```text
https://api.chess.com/pub/player/{username}/games/archives
https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
https://www.chess.com/callback/live/game/{gameId}
```

The first two are part of the published API. The callback endpoint supplies the
individual-board details used for full replay; it is not documented in the
published endpoint reference and can change or become unavailable. Partner
resolution can make extra requests to nearby IDs when no partner ID is supplied.
The current app does not call the monthly `/pgn` download endpoint.

The proposed built-in bulk opponent importer, monthly `tcn` opening-database
collection, and puzzle-mining workflow are **not implemented** here. Existing
Player Insights and the external opening explorer should not be confused with
that proposed local collection tool. No guaranteed download rate or complete
historical coverage is claimed.

Development references: [architecture](docs/architecture.md),
[data and services](docs/data-and-services.md),
[development workflow](docs/development.md), and the
[Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).

## Third-party notices

Fairy-Stockfish's GPL license and authorship notices are included in
`public/engine/fairy/Copying.txt` and `public/engine/fairy/AUTHORS`; bundled-engine
and network provenance is recorded in that directory's `README.txt`.
Chess-piece asset attribution is in `public/pieces/LICENSE.md`.
Preserve these notices when redistributing the desktop package.
