# Mystery Stock Market: multiplayer build spec

You are building a real-time multiplayer web game based on "Mystery Stock Market" (미스터리 거래소), the Day 2 main match of *The Devil's Plan: Dead Again* (Season 3, Episodes 4–5). Players trade seven fictional stocks for 24 rounds. Each stock's price moves by a hidden rule that is revealed word by word as the game goes on.

## 0. How to use this document

- **`design.md`** is the source of truth for anything visual: colors, type, spacing, components, motion. This spec only says what each screen must contain and do. If the two conflict on something visual, `design.md` wins. If `design.md` doesn't cover something, match its spirit and leave a short `// DESIGN:` comment.
- **`reference/prototype.html`** is a working single-player version, with bots, written in one file. Its `<script id="engine">` block is the reference implementation of the game logic: rule templates, `settle()`, bots, reveal groups and the show's rule set. Port that logic to TypeScript instead of reinventing it. If this spec and the prototype disagree, this spec wins. One known difference: the prototype shows Korean won (₩), but this build uses the made-up currency from §7.1, so no ₩ or "won" should appear anywhere in it.
- Work through the milestones in §16 in order. Run the tests at each milestone before moving on.
- §17 lists decisions I've already defaulted. Don't change them without asking. For anything not covered here, pick the simplest option that fits the rest of the spec and note it in `DECISIONS.md`.

## 1. Product summary

- A **host** creates a room and gets a short room code.
- **Players** join from their phones, by scanning a QR code or entering the code, and choose a display name. No accounts and no sign-up.
- A **TV** (any big screen with a browser) opens `https://<domain>/tv`. It shows a pairing code and a QR code. The host enters that code, or scans the QR with their phone, and the TV becomes the room's shared display: a lobby with the join QR, then the live market board, then the results.
- The host configures the game, can add bots to fill seats, and starts it. Everyone trades on their own phone. The server runs the clock, settles prices and enforces every rule.
- The full UI is translated. Launch languages are English, Hungarian and Korean.

## 2. Platform and architecture

Everything runs on Cloudflare: one Worker project, with no other servers or databases.

| Piece | Cloudflare product | Job |
|---|---|---|
| Static client (SPA) | Workers Static Assets | Serves the built client. Asset requests are free and don't invoke the Worker. |
| Router | Worker `fetch` handler | Handles `/api/*` and `/ws/*`. Everything else falls through to the SPA. |
| Game rooms | Durable Object class `Room`, SQLite-backed | One instance per room code. Holds the authoritative game state and every WebSocket for that room, and runs the round timer through alarms. |
| TV pairing | Durable Object class `TvPairing`, SQLite-backed | One instance per pairing code. Holds the waiting TV's socket until a host claims it. |

### State and storage: do we need a database?

We need state, but no separate database:

- A room's state (lobby, players, prices, holdings, secrets, the action log) lives inside its `Room` Durable Object. It is kept in memory while the room is active and persisted to the object's built-in SQLite storage, so it survives evictions, hibernation and deploys.
- Use the **WebSocket Hibernation API** (`ctx.acceptWebSocket`, `webSocketMessage`, `serializeAttachment`) so idle rooms cost nothing. Never keep per-socket state only in memory. Store role and player ID in the socket attachment, and the game in storage.
- **D1, KV and R2 are not needed.** Only add D1 later if we want cross-room features such as global stats or match history.
- SQLite-backed Durable Objects are available on the Workers Free plan. Budget check: the free plan allows about 100k Durable Object requests and 100k SQL rows written per day. Incoming WebSocket messages are billed at a 20:1 ratio. A 12-player, 24-round game is roughly 3–5k persisted writes, so persist after every accepted mutation (correctness first). Only add write coalescing if real usage gets close to the limit.
- Verify config syntax against the current Cloudflare docs before writing it. Don't rely on memory. A sketch:

```jsonc
// wrangler.jsonc (sketch; check current docs)
{
  "name": "mystery-stock-market",
  "main": "src/worker/index.ts",
  "compatibility_date": "<today>",
  "assets": {
    "directory": "./dist/client",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/ws/*"]
  },
  "durable_objects": {
    "bindings": [
      { "name": "ROOM", "class_name": "Room" },
      { "name": "TV_PAIRING", "class_name": "TvPairing" }
    ]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Room", "TvPairing"] }],
  "vars": { "PUBLIC_ORIGIN": "https://example.com" }
}
```

## 3. Routes and screens

| Route | Who | Purpose |
|---|---|---|
| `/` | anyone | Home: **Create a room** or **Join with a code**. Language switcher. |
| `/j/:code` | players | Join link, which the QR codes point to. Name entry, then the lobby. |
| `/r/:code` | players, host | The game: lobby, then trading, then results. The host sees host controls on top of the player view. |
| `/tv` | TV | Pairing screen: big pairing code and QR. After pairing, the same page becomes the room display. |
| `/pair/:pairCode` | host's phone | The TV's QR points here. Asks the host to confirm "Show room ABCDE on this TV?" |
| `/solo` | anyone | Optional, last milestone: single-player mode against bots, ported from the prototype. Runs entirely in the browser. |

API (JSON over HTTPS):

- `POST /api/rooms` creates a room. Returns `{ code, hostToken, playerId, playerToken }`. The host is also a player by default (§17).
- `POST /api/tv` creates a pairing code. Returns `{ pairCode, expiresAt }`.
- `GET /ws/room/:code`: WebSocket upgrade, forwarded to the `Room` Durable Object.
- `GET /ws/tv/:pairCode`: WebSocket upgrade, forwarded to the `TvPairing` Durable Object.

Codes:

- **Room code:** 5 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I). On create, check that the Durable Object is unused and retry on a collision.
- **Pairing code:** 6 digits shown as `482 913` (easy to type with a TV remote or a phone). Expires after 10 minutes, and the TV fetches a new one automatically.
- QR codes are generated client-side with a small library and encode absolute URLs built from `PUBLIC_ORIGIN`.

## 4. Roles and identity

There are no accounts. Identity is a random token kept in `localStorage`, keyed by room code.

| Role | How it's created | Can do |
|---|---|---|
| `host` | Creating the room | Everything a player can do, plus configure, add or remove bots, start, pause, resume, end a round early, end the game, kick players, pair or unpair TVs, and transfer host. |
| `player` | Joining with a name | Trade, place a secret, use pieces, press Ready. |
| `display` | Being paired by the host | Read-only public view. Multiple TVs per room are allowed. |
| `spectator` | Joining after the game started without a seat | Read-only public view. |

- Tokens are 128-bit random values. The host token and player token are separate secrets. A display token is read-only and can be revoked.
- Reconnecting with a token resumes the same seat with a full state snapshot. Holdings stay while a player is disconnected.
- **Names:** 1–16 characters after trimming, NFC-normalized, no control characters, and unique within the room (case-insensitive). Any script is allowed (Hangul, accented letters and so on). Always render names as text, never as HTML.
- If the host disconnects, the game keeps running because the clock is server-side. The host can reclaim the role with their token, or transfer it to another player.

## 5. Room lifecycle and lobby

States: `lobby` → `countdown` → `trading` ⇄ `paused` → `finished`.

- **Lobby:** the host's phone and the TV show the join QR, the room code and a live list of players. The host can kick players and add or remove bots in the lobby.
- **Host settings,** editable in the lobby only:

| Setting | Options | Default |
|---|---|---|
| Rule set | Show's rules / Randomized | Show's rules |
| Round length | 60, 120, 180 or 300 s | 120 s |
| End rounds early when everyone is ready | on / off | on |
| Bots | 0 up to (16 − humans) | 0 |
| Bot skill | Easy / Normal / Hard | Normal |
| Host plays | on / off | on |
| Room language | en / hu / ko | host's language |
| Seed | optional text | random |

- 2–16 seats in total (humans plus bots). The game needs at least 2 seats to start.
- **Start** runs a 5-second countdown, then round 1. Joining is closed once the game starts: newcomers become spectators, and existing seats can still reconnect.
- **Finished:** everyone sees the results. The host can start a new game in the same room, which keeps the players and resets the game.
- **Cleanup:** delete all storage (`ctx.storage.deleteAll()`) through an alarm after 2 hours idle in the lobby, or 1 hour after a game finishes.

## 6. TV pairing flow

1. The TV opens `/tv`, calls `POST /api/tv`, shows the pairing code and a QR for `/pair/:pairCode`, and opens `/ws/tv/:pairCode`.
2. The host either types the code in their lobby or in-game host menu ("Connect a TV"), or scans the TV's QR with their phone and confirms on `/pair/:pairCode`. If that phone isn't hosting a room, it shows "Only the host can connect a TV" and stops.
3. The `Room` Durable Object creates a display token and calls the `TvPairing` Durable Object over RPC with `{ roomCode, displayToken }`. The `TvPairing` object pushes that to the TV socket, then closes and deletes itself.
4. The TV stores `{ roomCode, displayToken }` and connects to `/ws/room/:code` as `display`. After a refresh it reconnects directly without pairing again.
5. The host's menu lists connected TVs, and the host can unpair each one, which revokes its token.

## 7. Game rules (authoritative)

### 7.1 Basics
- Seven stocks: **Open Security, CoyoTech, Latter Electronics, Defense Steel, Airtight Construction, Seasoned Financial, Alt Entertainment.** Their display names are translatable (§11).
- **Currency:** the made-up **Mystery Mark**, symbol **ℳ** (U+2133), plural "marks", internal code `MYM`. Define it once in `src/shared/currency.ts` (`{ code, symbol }`), with the name and plural forms in the i18n catalogs, so it can be renamed by editing one file plus the catalogs. All amounts are whole marks. There are no fractions.
- Every stock opens at **ℳ10,000**. The price floor is **ℳ100**. Each player starts with **ℳ100,000** and **3 pieces**.
- **24 rounds.** Players trade during a round. When the round ends, every stock settles to a new price at once.

### 7.2 Round flow (multiplayer)
1. A round opens with prices settled from the previous round. The server sends the deadline as an epoch-ms timestamp plus the server's current time, so clients can correct for clock skew.
2. Players trade, place secrets and use pieces. Every action is validated and applied immediately on the server.
3. The round ends when the deadline passes (via the Durable Object alarm), or early if "end early" is on and every connected human has pressed **Ready** (after a 3-second "settling…" countdown, which any Ready player can cancel by un-readying). The host can also end the round immediately.
4. Bots act, using the engine's existing bot logic. Pending secrets take effect. `settle()` runs. The server broadcasts the result, and each role receives its own projection (§8).
5. After round 24 settles, the game is finished.

### 7.3 Trades, volume and holdings
- Trades are in whole shares, filled at the current round's price, with no fees. Buys are limited by cash and sells by shares held. Prices don't move within a round.
- **Buy volume** and **sell volume** count every buy and every sell, not the net. Buying 10 and selling 10 in one round adds 10 to each.
- **Total holdings** is the sum of all seats' shares of that stock.
- During a round, players see only their own position. Market-wide volume and holdings are published at settlement as "last round" stats.

### 7.4 Rule types and settlement
Port `settle()` exactly. It is a pure function of `(rules, ctx)`.

| Type | Rule | Notes |
|---|---|---|
| `cmpBuy` | If this stock's buy volume > stock A's buy volume: +X ℳ; otherwise −Y ℳ | This round only. A tie, or both zero, counts as "otherwise". |
| `band` | If total holdings are between L and H (inclusive): +X ℳ; otherwise −Y ℳ | Uses holdings at the end of the round. Zero is outside the band. |
| `perShare` | −P ℳ for each share that total holdings increased, +P ℳ for each share they decreased | Compares end of this round with end of the previous round. |
| `follow` | If stock A rose this settlement: +X%; otherwise −Y% | Evaluated last because it depends on another stock's move. |
| `breadth` | If 4 or more stocks rose in the previous settlement: +X%; if 4 or more fell: −Y%; otherwise no change | No change in round 1. A stock pinned at the floor doesn't count as falling. |
| `secret` | If stock A will be hidden next round: +X%; otherwise −Y ℳ | So a secret on A boosts this stock in both settlements of its 2-round window. |
| `logo` | Price after round r = `logo[r]` | The price chart traces the logo shown in the header. |
| `sellBuy` | If sell volume > buy volume: +X ℳ; otherwise −Y ℳ | Randomized rule sets only. |
| `cheapest` | If this is the cheapest stock (ties count) before settlement: +X%; otherwise −Y ℳ | Randomized only. |
| `holdRank` | If this stock has the most total holdings (> 0; ties count): −X%; otherwise +Y ℳ | Randomized only. |

- Percent changes use integer math: `floor(p * (100 ± x) / 100)`. Every result is clamped to a minimum of 100.
- **Show's rules:** Open Security = `secret` on Latter (+13% / −1,000); CoyoTech = `cmpBuy` vs Latter (+1,400 / −700); Latter Electronics = `band` 10–30 (+1,500 / −1,000); Defense Steel = `perShare` 200; Airtight Construction = `follow` Defense Steel (±10%); Seasoned Financial = `breadth` 4 (+20% / −10%); Alt Entertainment = `logo`. These come from a fan reconstruction of the broadcast. The exact numbers and the logo path are in the prototype.
- **Randomized:** pick 7 of the 10 types, give them to random companies, and draw the numbers from the prototype's ranges. Generate a random logo path for each game, and always render the logo in the UI so the `logo` rule stays "hidden in plain sight".
- Everything random (rules, logo, bot behavior) comes from one seeded PRNG kept in the game state. Given the seed and the action log, a game must replay exactly.

### 7.5 Reveal schedule
- Each rule is a sequence of tokens tagged with a reveal group: group 0 is shown from the start, group 1 at round 5, group 2 at round 10, group 3 at round 15, and group 4 at round 20, when every rule is complete. The prototype's `ruleTokens()` is the English reference.
- Hidden tokens render as redaction bars sized to the hidden text's length in the viewer's language. The next group due to be revealed is visually marked.
- Rule templates are defined per locale (§11). Each translation has its own token sequence and group tags, written so the same information is revealed at the same rounds in every language.

### 7.6 Secrets
- Each seat can place one secret per game, on one stock. Placed in round r, it hides that stock during rounds r+1 and r+2.
- While a stock is hidden, everyone (TV included) sees `???` for its price, volume and holdings, and its chart points are never drawn, even after the secret ends. Hidden stocks can still be traded.
- Secrets are anonymous. Several secrets on the same stock in the same round count as one effect, and all of them are used up. A later secret on a stock that's already hidden runs 2 rounds from its own placement.
- While any secret is active, standings show the order but hide net worth for everyone.
- A player holding any share of a hidden stock can't see their own cash or net worth. They can still trade, and the server only tells them whether an order succeeded or failed for lack of cash.
- A secret can be placed in any round, including round 24, where it still matters for the `secret` rule.

### 7.7 Pieces
- Until the end of round 20, a piece can be spent on one of two things:
  - **Cash:** +ℳ10,000 immediately.
  - **Peek:** see the next hidden group of one stock's rule early. The peek is private to that player. A peek on a rule that's already fully visible is refused, and the piece is kept.
- Pieces earned at the end, shown in the results: 1 for ℳ1.5M or more, 2 for ℳ3M, 3 for ℳ6M, plus a "prize token" for ℳ10M.

### 7.8 End and ranking
- Players are ranked by total assets after round 24 settles. A tie is broken by the higher lowest-ever net worth during the game.
- Results show: the top 4 go to the living quarters (or the top half if there are fewer than 8 seats), last place is eliminated, and everyone else goes to prison. Show every rule in full, plus the seed.

### 7.9 Bots
- Port the prototype's bots: styles `momentum`, `contrarian`, `noise` and `holder`. Each bot has an "insight" round, after which it trades using `settle()` predictions. Easy bots never reach insight. Normal: about 40% reach it in rounds 12–18. Hard: about 70% reach it in rounds 4–10, and the rest in rounds 14–20.
- Bots act at settlement, after the humans, and use pieces and secrets as the prototype does. Show a "bot" badge next to their names.

## 8. Information hiding (server-side projections)

The server never sends anything a role isn't allowed to see. The client is not trusted. Build one `project(state, viewer)` function and test it.

| Data | Owner (player) | Other players | Display / spectator |
|---|---|---|---|
| Rule tokens | Revealed groups + own peeks; hidden ones as length-only bars | Revealed groups only | Revealed groups only |
| Full rules, seed, bot internals, RNG state | Only after the game ends | Only after the game ends | Only after the game ends |
| Prices, deltas, chart points | `???` / omitted while hidden | same | same |
| Last-round volume and holdings | `???` while hidden | same | same |
| Own cash, net worth, shares | Yes, but cash and net worth hidden while holding a hidden stock | — | — |
| Others' cash, shares, trades | Never | Never | Never |
| Standings (names, rank, bot badge, ready status) | Yes; net worth hidden while any secret is active | same | same |
| Who placed a secret | Only their own | No | No |
| Pieces left / secret used | Own only | No | No |

## 9. Realtime protocol

- JSON over a WebSocket. Every message has `type` and is validated with zod on both ends. Share the schemas in `src/shared/protocol.ts`.
- **Client → server:** `hello { token?, lang }`, `join { name }`, `setLang { lang }`, `trade { stock, side, qty, seq }`, `placeSecret { stock }`, `usePiece { kind: 'cash' | 'peek', stock? }`, `ready { value }`. Host only: `setConfig`, `addBot`, `removeBot`, `kick`, `start`, `pause`, `resume`, `endRound`, `endGame`, `newGame`, `pairTv { pairCode }`, `unpairTv { displayId }`, `transferHost { playerId }`.
- **Server → client:** `welcome { role, playerId?, token? }`, `view { ...projection }` (full snapshot on connect and after every settlement), `patch { ... }` (own position after a trade), `settled { round, deltas }` (used for animation), `error { code, params }`, `toast { code, params }`.
- **Errors and toasts are codes with parameters, never sentences,** so each client renders them in its own language. Examples: `insufficient_cash`, `not_enough_shares`, `secret_used`, `pieces_closed`, `name_taken`, `room_full`, `game_started`.
- `seq` makes trades idempotent across reconnects: the server ignores a `seq` it has already applied for that seat.
- Rate limit each socket to 20 messages per second and drop anything over that. Cap orders at 1,000,000 shares.

## 10. Persistence, timers and cleanup

- Room state is a typed object: config, seats, engine state, action log, displays and phase. Persist it to Durable Object storage after every accepted mutation, and load it in the constructor with `blockConcurrencyWhile`.
- The **action log** (each trade, secret, piece, ready and settlement with its timestamp) is persisted too. It makes replays and debugging deterministic.
- A Durable Object has only **one alarm.** Keep a small schedule of upcoming events (round deadline, early-end countdown, cleanup) and always set the alarm to the earliest one. Pausing stores the time left and clears the round event.
- After a deploy or eviction, the alarm and the stored state fully restore the game, and clients reconnect automatically with backoff.

## 11. Internationalization

- Launch locales: `en`, `hu`, `ko`. Put catalogs in `src/shared/i18n/<locale>.json`, with keys generated as a TypeScript type from `en.json` so a missing key fails the build. A tiny `t(key, params)` helper is enough: use `Intl.PluralRules` for plurals and avoid a heavy i18n library.
- Pick the initial locale from `navigator.language`, put a language switcher on every screen, and persist the choice. The TV uses the room language by default and can switch.
- **Money:** the game uses the made-up currency from §7.1, never a real one. `Intl` currency formatting only accepts real ISO codes, so write a small `formatMoney(amount, locale)` helper. It formats the number with `Intl.NumberFormat(locale, { maximumFractionDigits: 0 })` and places the symbol according to a per-locale pattern in the catalog (for example `"{symbol}{amount}"` in `en`, `"{amount} {symbol}"` in `hu`). Use the compact form for large values where space is tight (`Intl` `notation: 'compact'` → ℳ1.5M). Format all other numbers and percentages with `Intl`.
- **Rule templates are per locale.** Each locale defines, for each rule type, its own ordered token list. Each token has a reveal group and a template string with `{params}` such as company names and numbers. The server renders tokens in each viewer's language when it projects, so redaction lengths match what that viewer would read. Hungarian and Korean word order will differ from English; that's expected.
- Company names live in the catalogs. Korean can use the show's original Korean names if we can confirm them; otherwise use transliterations.
- **Up/down colors:** the default is the Korean convention (red ▲ = up, blue ▼ = down). Add a setting for the Western convention (green up, red down). Always pair color with an arrow.
- Every server→client message that becomes visible text carries codes and parameters only (§9).
- Write the Hungarian and Korean strings yourself and list them in `I18N_REVIEW.md` for a native speaker to check.

## 12. Screens (what they contain; visuals from `design.md`)

**Phone, player (mobile-first, one column, no sideways scrolling):**
- Sticky top bar: round `07/24`, a countdown, the next reveal round, and a **Ready** toggle.
- The seven stocks: name, price, arrow and delta, a mini chart, the rule with redaction bars, last-round stats, my shares and their value, and trade controls (quantity, Buy, Sell, Max, All). Collapsible rows or swipeable cards are fine, but price and arrow must always be visible.
- Desk: cash, net worth, pieces, secret status, Place secret, Peek, Cash in a piece.
- Standings (with ready markers and bot badges), plus a feed of public events.
- A private notes field for each stock, stored locally only.

**Phone, host:** everything above, plus a host sheet with settings (lobby only), bots, start/pause/resume/end round/end game, Connect a TV, the TV list, kicking players and transferring host. A host who isn't playing gets the public view plus host controls.

**TV (16:9, readable from across a room, no scrolling, no inputs after pairing):**
- **Pairing:** a huge pairing code, a QR, "Open `<domain>/tv` and enter this code on the host's phone", and a language switcher.
- **Lobby:** a big join QR, the room code, the join URL, and player names appearing as they join.
- **Trading:** all seven stocks at once (price, arrow, chart, rule), the round, a large countdown, standings, and how many players are ready.
- **Settlement moment:** prices animate to their new values. On reveal rounds (5, 10, 15, 20), the newly revealed words get a short highlight. Respect `prefers-reduced-motion`.
- **Results:** a podium with the rest of the ranking, zones (living quarters / prison / eliminated), every rule revealed, and pieces earned.

**Home, join and pair pages:** short and fast. Join pre-fills the code from the URL and asks only for a name.

## 13. Security and abuse

- Validate every message. Never trust client-sent prices, cash or round numbers.
- Tokens are 128-bit random values. Rooms are only reachable by their code. Throttle failed room lookups per IP (for example, 30 per minute) to slow down code guessing.
- Escape all user text. Don't set `innerHTML` with user data.
- Cap 16 seats per room, plus 8 spectators and 4 displays.

## 14. Project layout and tooling

```
reference/prototype.html      # single-player prototype (reference only)
design.md                     # visual design (provided)
src/engine/                   # pure TS game engine: rules, settle, bots, rng, projections
src/shared/                   # protocol (zod), i18n catalogs + t(), rule templates per locale
src/worker/index.ts           # router: /api, /ws, assets fallthrough
src/worker/room.ts            # Room Durable Object
src/worker/tvPairing.ts       # TvPairing Durable Object
src/client/                   # Vite + React SPA (routes in §3)
wrangler.jsonc
```

- TypeScript strict mode. Vite for the client. Use the Cloudflare Vite plugin, or `wrangler dev`, for local full-stack development.
- Keep `src/engine` free of DOM and Workers APIs so it runs unchanged in the Worker, the browser (for `/solo`) and the tests.

## 15. Testing and acceptance

- **Engine unit tests (Vitest):** at least one targeted test per rule type, including boundary cases (band edges, floor behavior, breadth with a floored stock, follow ordering, a secret's 2-round window, wash trading for `cmpBuy`). Also a test that a seed plus an action log replays to the identical final state, and a full simulated 24-round game with bots at every skill level that finishes with no negative cash or shares.
- **Projection tests:** for every role, assert that no hidden field leaks (rules, other players' cash, who placed a secret, hidden prices). Write these before building the UI.
- **Durable Object tests:** use Cloudflare's Vitest integration for Workers to cover create room → join → start → trade → round settles via alarm → reconnect with token → finish → cleanup alarm.
- **End-to-end (Playwright):** one host and two players in separate browser contexts, plus a TV pairing flow, run against `wrangler dev`.

The build is done when:
1. A host on one phone, two players on other phones and a TV can play a full game, with the TV paired by code and by QR.
2. Refreshing any device mid-game resumes it exactly, and a deploy mid-game doesn't lose the game.
3. Switching language changes every visible string, rule text and number format on that device without a reload.
4. No hidden information appears in any WebSocket frame (check this in the e2e test by inspecting frames).
5. It deploys with `wrangler deploy` and needs nothing beyond Workers and Durable Objects.

## 16. Milestones

1. **Engine:** port from the prototype to `src/engine`, with seeded RNG, action log, replay and all engine tests.
2. **Projections and protocol:** `project()`, the zod schemas, and the leak tests.
3. **Worker and Room Durable Object:** create/join/reconnect, lobby, start, trades, alarms, settlement, persistence, cleanup, and the Durable Object tests.
4. **Phone client:** home, join, lobby, trading, results, and host controls.
5. **TV:** pairing Durable Object, `/tv`, `/pair/:code`, and the display views.
6. **i18n:** catalogs, per-locale rule templates, the `Intl` formatting, and `I18N_REVIEW.md`.
7. **Polish:** reconnect backoff, rate limits, reduced motion, the e2e tests, deploy.
8. **Optional:** `/solo`, running the engine and bots in the browser.

## 17. Defaults already chosen

- The host is also a player by default and can switch that off in the lobby.
- Joining closes when the game starts. Late arrivals watch as spectators.
- A kicked player's seat freezes: their holdings stay in the market, but they can't act and they rank as normal.
- Bots trade after humans at settlement, so they can react to that round's human trades. This is accepted and documented in the How to play text.
- Round length defaults to 120 s instead of the show's 300 s. "End early when everyone is ready" defaults to on.
- No accounts, no persistent profiles, no cross-room history.
- The show's rules are fan-reconstructed. A few words, the logo shape and the 3 starting pieces are our own additions, and the How to play screen says so.
