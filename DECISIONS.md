# Decisions

Choices made where `SPEC.md` was silent, ambiguous, or could not be followed as written. Defaults listed in SPEC §17 were kept unchanged.

## Missing reference prototype

`SPEC.md` §0 points to `reference/prototype.html` as the reference implementation of the engine (rule templates, `settle()`, bots, reveal groups, exact numbers, logo path). **That file was not in the repository**, so the engine in `src/engine` was written from the rules in SPEC §7 instead. Where the prototype would have decided something, these are our own choices:

- **Show's rules:** the numbers from SPEC §7.4 (Open Security `secret` on Latter +13% / −1,000; CoyoTech `cmpBuy` vs Latter +1,400 / −700; Latter `band` 10–30 +1,500 / −1,000; Defense `perShare` 200; Airtight `follow` Defense ±10%; Seasoned `breadth` 4 +20% / −10%; Alt `logo`).
- **Show logo path:** an "M" (for *Mystery*) — up to ℳ20,800 at round 6, down to ℳ11,800 at round 12, up to ℳ20,800 at round 18, down to ℳ8,800 at round 24 (`SHOW_LOGO` in `src/engine/rules.ts`). The header logo is drawn from this path.
- **Randomized ranges** (`src/engine/rules.ts`): cmpBuy +800–2,000 / −400–1,200; band L 5–20, H = L + 10–30, +1,000–2,000 / −600–1,400; perShare 100–300 (step 50); follow ±5–15%; breadth k = 4, +10–25% / −5–15%; secret +8–18% / −500–1,500; sellBuy like cmpBuy; cheapest +5–20% / −300–1,000; holdRank −5–15% / +300–1,000. Random logo: 5–8 control points between ℳ3,000 and ℳ26,000, joined by straight lines.
- **Rule wording and reveal groups:** our own English token lists (`src/shared/ruleTemplates.ts`). Every rule type uses all five groups; a test checks this for every locale.
- **Bots:** designed from SPEC §7.9. Styles: momentum (buy last risers, dump fallers), contrarian (the opposite), noise (1–3 random orders), holder (buy 2–3 stocks, rarely rotate). After the insight round a bot sells stocks `settle()` predicts will fall, then buys the best predicted gainers, re-running `settle()` with its own order included and halving the size until the prediction still holds. Bots cash in pieces on 3 planned rounds (all leftovers in round 20) and ~60% of bots place a secret in a random round; an insightful bot aims its secret at the target of a `secret` rule.

If the prototype turns up, compare `settle()` and the bots against it and adjust; the engine tests pin the behaviour described above.

## Rules interpretation

- **`breadth`** counts all seven stocks (itself included). "Pinned at the floor" means a stock that stayed at ℳ100: its move is 0, so it is neither rising nor falling.
- **`band`**: zero holdings are always outside the band, whatever L is.
- **`follow`**: evaluated after all other rules. If a randomized set ever contained a follow-cycle it is treated as "did not rise" (cannot happen today: each type is used at most once).
- **Peek**: shows the group after the higher of (public level, previous peek). When the public reveal catches up, the earlier peek gives no extra advantage. A peek on a complete rule is refused and the piece kept.
- **Hidden stocks**: chart points from hidden rounds are omitted for the rest of the game and only drawn in the results. A delta is omitted when either of its two points is hidden.
- **Holding a hidden stock** hides your own cash and net worth (SPEC §7.6); the Max button is disabled then because the client cannot compute it.
- **Host "End game"** finishes immediately and ranks on the current prices; the remaining rounds are not settled. Logged as an `end` action so replays still match.
- **No living quarters / prison / eliminated zones** (owner's call, overrides SPEC §7.8): those are the show's meta-game and don't apply here. The highest net worth wins; ties go to the higher lowest-ever net worth. Results still show end-of-game pieces and the prize token (SPEC §7.7).
- **Ready / end early** needs at least one connected, seated, non-frozen human; bots never count. The 3-second countdown is re-checked when the alarm fires.
- **Event feed** carries only public events: joins, kicks, start, settlements, reveals, a stock becoming hidden, pause/resume, host changes. Secret placement and piece use are never announced.

## Protocol and identity

- `hello` carries an optional `hostToken` next to `token`, because the host token and the player token are separate secrets (SPEC §4). Display tokens use the `token` field.
- Trade `seq`: the client starts from the current timestamp and increments it (persisted per room), so a cleared device never reuses an old number; the server ignores any `seq` ≤ the last applied one for that seat.
- A host who is not playing and transfers host mid-game becomes a spectator.
- Kicked in the lobby = removed. Kicked mid-game = seat frozen, token refused, ranks as normal.
- The settlement `deltas` message hides deltas of stocks that are hidden in the new round.

## Platform

- **Storage:** the room snapshot is one value in the Durable Object's SQLite-backed KV (`room`); the action log is a SQL table `log(game, at, action)`, appended on every accepted mutation. The snapshot is written after every accepted mutation.
- **Cleanup:** 2 h idle in the lobby and 1 h after finishing (per spec). Every game also has a **4-hour cap** (`GAME_MAX_MS`, owner's call): when it is reached the game ends on current prices (`end` action, "time limit" feed event), so every room is cleaned up at most an hour later — paused or abandoned games included.
- **"No limit" round length** (owner's call, extends SPEC §5's 60/120/180/300 s): `roundSeconds: 0`. Rounds have no deadline and end when every connected player is ready (the 3-second settle countdown runs even if "end early" is off), or when the host ends the round. The top bar and TV show ∞.
- **Failed room-lookup throttle** (30/min per IP) is an in-memory map per Worker isolate — approximate, but needs no extra product. Swap in the Workers Rate Limiting binding if guessing becomes a problem.
- **TV pairing codes** are random 6-digit numbers with a collision retry; the TV fetches a fresh code 5 s before expiry and whenever its socket drops.
- **Local dev origin:** `PUBLIC_ORIGIN` is empty in `.dev.vars`, so join/QR URLs use the request origin (localhost or your LAN IP). Production uses `https://stocks.aroncreates.com`.
- **Tests:** the Workers Vitest integration is now published as `@cloudflare/vitest-plugin` (Vitest 4). Playwright uses the locally installed Chrome (`channel: "chrome"`) so no browser download is needed.

## UI

- **Font weights:** design.md asks for bold display type and regular/medium body, but also "no more than two weights per screen". We use exactly two: 400 and 600 (General Sans Semibold for display).
- **Dark mode** colors are derived from the light palette (design.md only defines light values), following `prefers-color-scheme`.
- **Up/down colors:** Korean convention by default (red `#E5383B` up, blue `#1D6FD8` down — a blue distinct from the indigo reserved for interactive elements). The Western convention (green up, red down) is a per-device setting. Arrows always accompany color.
- **Next reveal group** is marked with amber diagonal stripes; newly revealed words get a short amber highlight (disabled with `prefers-reduced-motion`).
- **Language switcher:** in the top bar on home, lobby, pairing and results screens on phones and PCs; during a game it sits in the ⋯ / host-menu settings sheet so the top bar fits a 375 px phone.
- **One game language, locked** (owner's call, overrides SPEC §11's per-device switching during a game): the host picks the **Game language** in the lobby (defaults to the host's language). From the countdown until the next lobby, the server renders rule text in that language for every viewer, and every phone and the TV switch their whole UI to it; language switchers hide (Settings shows which language the host chose). Everyone reads the same rule wording, which matters while the Hungarian and Korean text is unreviewed. Players pick their own language again in the lobby and on the home screen.
- **The TV has no language switch** (owner's call): no top bar, no inputs. It shows English until paired, then the room's game language.
- **TV board:** stock cards show logo, name, price, change and a chart scaled to the rounds played so far; all rules sit in one panel along the bottom; round, clock, standings and feed form a right-hand column; the eighth tile shows the game logo (the `logo` rule in plain sight) and the room code.
- **ℳ glyph:** neither DM Sans nor General Sans includes U+2133, so it falls back to a system font that has it.
- **Solo mode** (`/solo`): the same engine and projection in the browser; Ready settles the round immediately.

## Hand-made boards (owner's call)

- Show's rules is itself a board in `BOARDS` (`src/engine/boards.ts`), so it gets the same checks and can be dealt in a new order like the others; games play byte-for-byte as before. Random always uses the show's 7 companies. The other hand-made boards: **The Beginning** (4 companies), **Season 2** (the show's 7 companies, each with a different rule type than on the show) and **Grand Market** (9 companies: the show's 7 plus two new ones, Tidal Energy and Halo Pharma).
- A game stores `companies[slot]` (index into `STOCK_IDS`); every per-stock array is indexed by slot, and a rule's `a` points at a slot. Show and Random replay exactly as before; games saved without `companies` read as the show's 7.
- `boardProblems` checks a board (companies vs rules, references, breadth k, one logo stock, no follow loops) and `defineBoard` runs it when the module loads, so a broken board fails every test.
- `dealBoard` deals a board's rules to its companies in a seeded new order and moves every reference with its target. Tests deal each board (Show's included) 25 ways and play bot games on the deals. A board can opt in with `shuffle: true`; none does yet.
- To add a board: an id in `BOARD_IDS` (types.ts), a `set.rule<Id>` name in the three catalogs and an entry in `BOARDS`.
- The client maps slots to company names and logos through `FixedLang companies=…`; the rules explainer and home page always show the show's 7. The TV board uses 2×2 + brand for 4 companies, 4×2 for 7 and 5×2 for 9.

## Fixed rules and logo shapes

- Three rule types ignore what players do: `steady` (+x every round), `growth` (+x% every round) and `alternate` (+x in odd rounds, −y in even rounds). They have text in all three languages and work on any board.
- The follow-the-icon (`logo`) rule can use seven shapes (`LOGOS` in `rules.ts`): the show's M, W, peak, valley, bolt, stairs and wave. A board picks one with `logo: "<id>"` (default M); the game logo on every screen shows that shape during the game.
- Random's rule pool (`RULE_TYPES`) is frozen at the original ten types, so a seed always gives the same Random game. New types are for hand-made boards.

## Non-functional requirements pass (2026-11-24)

- `NON_FUNCTIONAL_REQUIREMENTS.md` lists the targets and, at the end, what this repo meets.
- Per-IP limits live in a `Limiter` Durable Object keyed by a hash of the IP (the IP itself is never stored): 10 rooms and 20 TV codes per hour, 120 room connections per minute. Joins are not held to 10 per minute because a whole party connects from one home router.
- Lobbies close after 30 idle minutes (was 2 hours).
- Hosts can download a finished game (seed + actions, `msm-game-v1`) for bug reports; only finished games, so nothing hidden leaks.
- `/api/health` answers only when `PUBLIC_ORIGIN` is empty (local dev).
- Fonts stay on the Fontshare and Google Fonts CDNs (owner's call): the offline and no-outside-requests targets are accepted as not met.
