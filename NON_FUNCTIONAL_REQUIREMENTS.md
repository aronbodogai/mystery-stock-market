# Non-functional requirements: local-only multiplayer party game

Nov 24, 2026 · @aron b personal

## Scope and assumptions

These requirements apply to a real-time multiplayer party game like Mystery Stock Market, built and run on one developer machine with no git repository, no CI and no hosted deploy (stage 1; see Versioning and backup, by stage).

- **Stack:** Cloudflare Worker + SQLite-backed Durable Objects (WebSocket Hibernation API, alarms), run locally through Vite + `@cloudflare/vite-plugin` (workerd); React SPA; a pure, seeded TypeScript game engine shared by client and server; zod for the wire protocol.
- **Player counts (functional):** 2–16 seats, spectators and up to 4 TV displays per room come from the functional spec; the requirements below only say how the game must perform at those counts. All devices are on the same local network as the dev machine (phones join by LAN IP or QR code).
- **Out of scope:** public hosting, custom domains, accounts (until the stage 2 MCP login), payments, analytics.
- Each requirement has an ID (`NFR-<area>-<n>`), a measurable target and how it is checked, so it can be ticked off locally.

## Performance and latency

Every player should see a trade, a ready tap or a round settlement land within a quarter of a second on the local network.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-PERF-1 | Action round trip (trade, ready, secret) from phone to every connected screen | p95 ≤ 250 ms on local Wi-Fi with 16 seats | Timestamped log in the dev console over a 16-seat bot game |
| NFR-PERF-2 | Round settlement (bots act + `settle()` + state broadcast) | ≤ 100 ms server time for 16 seats, 9 stocks | Timer around the settle path in a Vitest run |
| NFR-PERF-3 | First load of the SPA on a phone over LAN | Interactive in ≤ 3 s; JS ≤ 300 KB gzip | `vite build` size report; phone stopwatch |
| NFR-PERF-4 | Price and net-worth animations | 60 fps on a mid-range phone; honour `prefers-reduced-motion` | Chrome performance panel; reduced-motion toggle |
| NFR-PERF-5 | Narration and music start after pressing play | ≤ 500 ms; audio files ≤ 250 KB per clip | File sizes in `public/`; manual check |
| NFR-PERF-6 | Server messages per socket | Rate-limited to 20 per second; excess dropped with an error code | Durable Object test that floods one socket |

## Capacity and scalability

One laptop must run a full party: a few rooms at once, each with up to 16 players, 8 spectators and 4 TVs.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-CAP-1 | Performance at the largest room | All NFR-PERF targets still met with the maximum room the functional spec allows (16 seats, 8 spectators, 4 TVs) connected | 16-seat bot game with 8 spectator tabs and 4 TV tabs open |
| NFR-CAP-2 | Concurrent rooms on the dev machine | ≥ 5 rooms playing at once without NFR-PERF-1 slipping | Bot-only load script opening 5 rooms |
| NFR-CAP-3 | Board size | Any board of 2–9 companies works on phone, PC and TV layouts | Board tests + a game on 4-, 7- and 9-company boards |
| NFR-CAP-4 | Stored state per room | ≤ 1 MB (snapshot + action log) for a 24-round, 16-seat game | Size of the Durable Object storage after a bot game |
| NFR-CAP-5 | Game length cap | Every game ends after 24 rounds or 4 hours, whichever comes first; idle rooms are cleaned up | Durable Object alarm test |

## Reliability, recovery and determinism

A game must survive a phone locking, a browser refresh or a dev-server restart, and replay to exactly the same state from its seed and action log.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-REL-1 | Deterministic engine | Same seed + same ordered actions = byte-identical state, on client and server | Replay test comparing `JSON.stringify` of both states |
| NFR-REL-2 | Existing rule sets never change behaviour | Show and Random games for fixed seeds keep the same fingerprint after any change | Fingerprint test (hash of 3 seeded games per set) |
| NFR-REL-3 | Reconnect after a dropped socket | Player is back in the same seat with the same view in ≤ 3 s, no duplicate trades | Kill the socket in DevTools; trade sequence numbers checked server-side |
| NFR-REL-4 | State persistence | Every accepted action is in Durable Object storage before it is acknowledged | DO test: restart the object mid-round, state intact |
| NFR-REL-5 | Dev-server restart | A room in progress resumes after `npm run dev` restarts (local DO storage in `.wrangler/`) | Manual: restart mid-game, rejoin |
| NFR-REL-6 | Timers | Round deadlines and early end run from DO alarms, not client clocks; client shows server time with offset | DO alarm tests; clock-skewed browser check |
| NFR-REL-7 | Bad input | Every client message is validated with zod; invalid ones get an error code and change nothing | Protocol fuzz test |

## Security, fair play and privacy

No player may see anything the rules hide from them, even by reading the network traffic; that matters more than any outside attacker on a local network.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-SEC-1 | Information hiding | Hidden prices, unrevealed rule words, other players' holdings and peeks never leave the server for that viewer | One projection function per viewer; leak test scanning every WebSocket frame |
| NFR-SEC-2 | Authority | The server decides every outcome; the client is never trusted for prices, cash or results | Code review: client sends intents only |
| NFR-SEC-3 | Tokens | Player, host and TV tokens are 128-bit random, stored only on the device that owns them | Token length check; storage inspection |
| NFR-SEC-4 | LAN exposure | Dev server binds to the LAN only while a party runs; no port forwarding; nothing listens on a public interface | Manual: firewall rule and `--host` flag documented |
| NFR-SEC-5 | Secrets on disk | API keys (e.g. ElevenLabs) only in `.dev.vars` or the OS keychain, never in source files | trufflehog filesystem scan in the local gate (and in CI from stage 2) |
| NFR-SEC-6 | Personal data | Only a display name is collected; no email, no analytics, no third-party trackers | Network tab shows no outside requests during a game |
| NFR-SEC-7 | Room and seat spam (scripts or agents) | Per client (IP, or agent key from stage 2): ≤ 10 rooms created per hour, ≤ 10 joins per minute, ≤ 3 open rooms hosted at once; empty lobbies close after 30 minutes | Script that creates and joins rooms in a loop gets refused past each limit |

## Usability, accessibility and devices

The game is played on phones, run from a PC and watched on a TV, so each screen must work on its own size without horizontal scrolling.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-UX-1 | Screen sizes | Phone from 360 px wide, PC up to 1920 px, TV at 1920×1080 viewed from 3 m; no horizontal scroll | Browser device emulation at 375, 1440 and 1920 px |
| NFR-UX-2 | Accessibility | WCAG 2.2 AA contrast; keyboard reachable controls; every icon button has a label; price moves carry an arrow, not colour alone | axe scan; keyboard-only walkthrough |
| NFR-UX-3 | Design system | One source of visual truth (`design.md`): tokens on `:root`, dark and light mode, indigo only for interactive elements | Visual review in both colour schemes |
| NFR-UX-4 | Onboarding | A new player understands the rules in ≤ 2 minutes: rules video + written rules shown on entering a room | Hallway test with one new player |
| NFR-UX-5 | Dialogs | Every pop-up closes with a Close button, Escape and a click outside, except the one-time rules gate | Manual check per dialog |
| NFR-UX-6 | Touch targets | ≥ 44×44 px on phones | Device emulation measurement |

## Localization

Every player at one table must read the same rule wording, in English, Hungarian or Korean.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-L10N-1 | No hard-coded text | Every UI string lives in the `en`, `hu` and `ko` catalogs; keys are type-checked | Typecheck fails on a missing key |
| NFR-L10N-2 | Server sends codes, not sentences | Events, errors and rules travel as a code + params and are rendered on each device | Protocol review |
| NFR-L10N-3 | Rule reveal parity | Each rule's text reveals the same information per round group (0–4) in every language | Test over every rule template |
| NFR-L10N-4 | Game language lock | Once a game starts, all phones and the TV use the host's game language | Room test with mixed device languages |
| NFR-L10N-5 | Formatting | Money, numbers and percentages use `Intl` per locale; the custom currency symbol sits where each locale expects it | Unit tests on the formatters |
| NFR-L10N-6 | Review of machine-written text | Every new HU and KO string is listed for a native-speaker review before a party | Generated review file regenerated by a test |

## Maintainability and code quality

With no reviewer and no repository, the code has to explain itself and fail loudly when something is wrong.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-MNT-1 | Type safety | TypeScript `strict` with `noUncheckedIndexedAccess`; zero type errors in client and worker configs | `npm run typecheck` |
| NFR-MNT-2 | Pure engine | The engine has no I/O, timers or `Math.random`; all randomness comes from the seeded RNG | Lint rule or grep check in the local gate |
| NFR-MNT-3 | Data-driven content | New boards and rules are added as data and checked when the module loads (`boardProblems`); a broken board fails every test | Board-check tests |
| NFR-MNT-4 | Stable random sets | The Random rule pool and RNG call order are frozen; new rule types go to hand-made boards only | Fingerprint test (NFR-REL-2) |
| NFR-MNT-5 | Decisions written down | Every design call with a trade-off gets a dated line in `DECISIONS.md` | Read before each party |
| NFR-MNT-6 | Dependencies | Exact versions in `package-lock.json`; no package newer than 14 days added on a party day | `npm ci` from the lockfile |

## Testing and local quality gates

Without CI, one local command must stand in for it, and nothing counts as done until that command passes.

1. **One gate:** `npm run check` runs typecheck, engine tests (Vitest, Node), Durable Object tests (`@cloudflare/vitest-plugin`, workerd), `vite build`, the Playwright end-to-end game and a trufflehog scan, in that order, stopping at the first failure. Target: ≤ 3 minutes.
2. **When it runs:** before every party; a failed gate means no party on that build.
3. **Coverage floors:** engine ≥ 90% lines; the projection (information hiding) 100% branches.
4. **End-to-end:** one scripted game with a host, two players and a TV on Chrome; every WebSocket frame scanned for hidden information.
5. **Balance check:** each board plays 3 seeded bot games; no board ends with every stock at the price floor.
6. **Manual smoke list:** a 10-step checklist (create room, join by QR, pair TV, play 3 rounds, reconnect, finish) run on a real phone before each party.

## Versioning and backup, by stage

Stage 1 (local development) needs no git, versioning or backup; those start in stage 2, when the project leaves the dev machine.

| Stage | When | Git | Versioning | Backup |
| --- | --- | --- | --- | --- |
| 1. Local development | Built and played on one machine and its LAN | Not required | Not required | Not required |
| 2. Shared or hosted | Code shared with others, or the game deployed for players outside the LAN | A repository with a protected main branch; CI runs the local gate on every change | Version in `package.json`, shown in the app footer, tagged per release | The remote repository is the off-machine copy; a clean clone passes the gate |

## Local environment and portability

The project must set up on a clean Windows, macOS or Linux machine from a snapshot in under 15 minutes.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-ENV-1 | Toolchain | Node version pinned in `.nvmrc` and `package.json` `engines`; Wrangler and Vite from devDependencies only, no global installs | `npm ci` on a clean machine |
| NFR-ENV-2 | One-command start | `npm run dev` serves the app and the Worker with Durable Objects on port 5173, reachable from phones on the LAN | Join from a phone by QR code |
| NFR-ENV-3 | Same runtime as production | Worker code runs in workerd locally; no Node-only APIs in worker code | Durable Object tests run in workerd |
| NFR-ENV-4 | Origin handling | An empty `PUBLIC_ORIGIN` uses the request origin, so QR codes point at the machine's LAN IP | QR scan from a phone |
| NFR-ENV-5 | Browsers | Latest two versions of Chrome, Safari (iOS) and Firefox on phones and PC | Manual check per browser before a party |
| NFR-ENV-6 | Offline | A party works with no internet: fonts, audio and scripts all served locally | Disconnect the router uplink and play a round |

## Headless mode and AI-agent access (MCP, stage 2)

Stage 1 (local, no public endpoint) needs no MCP server. From stage 2, when the site has a public endpoint, an AI agent must be able to play a whole game with no browser, through an MCP server on the same Worker, under exactly the same rules and information limits as a human.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-MCP-1 | MCP server | One MCP endpoint (Streamable HTTP, `/mcp`) on the same Worker, e.g. via the Cloudflare Agents SDK `McpAgent` | MCP Inspector lists the tools |
| NFR-MCP-2 | Full game, headless | Every player and host action has a tool: create room, join, read view, trade, place secret, use piece, ready, and host setup/start | Scripted MCP client plays a 24-round game alone with bots |
| NFR-MCP-3 | Same rules, same limits | Tools call the same engine and the same per-viewer projection as the WebSocket; an agent never sees more than a human in its seat | Leak test run over MCP responses too |
| NFR-MCP-4 | Waiting without a socket | A `wait_for_change` tool returns when the room changes or after ≤ 30 s, so agents need no polling loop | Agent completes a round with only waits and actions |
| NFR-MCP-5 | One schema | Tool inputs and outputs come from the existing zod protocol; results carry codes + params plus text in the requested language | Typecheck; schema snapshot test |
| NFR-MCP-6 | Latency | Tool call p95 ≤ 300 ms (excluding `wait_for_change`) | Timed MCP client run |
| NFR-MCP-7 | Fair play at the table | Agents show as "agent" in the player list; the host can turn agent seats off per room; agents obey the 20 messages/s limit | Room test with an agent seat |
| NFR-MCP-8 | Login required | OAuth 2.1 login for every MCP session, handled by Cloudflare Zero Trust Access on the /mcp path only (guests still pick a name and play in the browser with no login); calls without a valid login are refused; agent seats, rate limits (NFR-SEC-7) and the agent label are tied to the logged-in account | MCP client without a token gets 401; with a token it can play |

Accepted risk: one person running several agents in the same game can pool their seats' information and trade together. Agents are labelled and the host can turn agent seats off (NFR-MCP-7); nothing further is required.

## Observability and diagnostics

When something goes wrong mid-party, the host must find out why from the dev machine in under a minute.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-OBS-1 | Structured logs | The Worker logs one JSON line per room event (join, start, settle, error) with room code and round; no tokens or names in logs | Read the dev-server log after a game |
| NFR-OBS-2 | Replayable bugs | Any finished or broken game can be exported as seed + action log and replayed in a test | Export button for the host; replay test |
| NFR-OBS-3 | Client errors | Uncaught client errors show a toast with an error code and are logged with the room code | Throw a test error in dev |
| NFR-OBS-4 | Health view | A local-only `/api/health` lists open rooms, sockets and alarm times | Hit it during a bot game |

## Assets, licensing and third-party services

Generated audio and borrowed ideas must be allowed for how the game is used, and the game must not need any outside service at play time.

| ID | Requirement | Target | How it is checked |
| --- | --- | --- | --- |
| NFR-LIC-1 | Generated audio | Narration, sound effects and music (e.g. ElevenLabs) are generated once, saved as files and listed with voice, model and date in `NARRATION.md` | File list matches the manifest |
| NFR-LIC-2 | Plan terms | The generator's plan allows the intended use; for ElevenLabs the commercial licence starts on the paid Starter plan, not Free ([pricing page](https://elevenlabs.io/pricing), read 2026-11-24); attribution rules still to check in their terms | Terms checked when the plan changes |
| NFR-LIC-3 | Original content | Inspired-by credit for the source show; no copied names, art or music from it | Review of names and assets before a party |
| NFR-LIC-4 | Fonts and libraries | Every bundled font and package has a licence that allows redistribution; list kept in `THIRD_PARTY.md` | `npx license-checker` output reviewed |
| NFR-LIC-5 | No runtime dependencies | No external API calls while playing (audio, fonts, QR codes all local) | Same as NFR-ENV-6 |


## Implementation status in this repository (2026-11-24)

This repository is already in stage 2 (public GitHub repo with CI, deployed to stocks.aroncreates.com). "Met" means code or a test enforces it; "Check" means it has not been measured yet; "Gap" means it is not done.

| Status | Requirements | Where |
| --- | --- | --- |
| Met | PERF-6, CAP-3, CAP-5, REL-1, REL-3, REL-4, REL-6, SEC-1, SEC-2, SEC-3, SEC-5, UX-3, UX-5, L10N-1 to 6, MNT-3 to 5, ENV-2 to 4, LIC-1, LIC-3 | Existing code and tests |
| Met (new) | REL-2 fingerprints, REL-7 fuzzing, MNT-2 engine purity | `test/engine/stability.test.ts` |
| Met (new) | MNT-1 `noUncheckedIndexedAccess`, ENV-1 Node pin | `tsconfig.base.json`, `.nvmrc`, `package.json` engines |
| Met (new) | SEC-7 per-IP limits: 10 rooms/hour, 20 TV codes/hour, 120 connections/minute; idle lobbies close after 30 minutes | `src/worker/limiter.ts`, `src/worker/room.ts` |
| Met (new) | OBS-1 JSON room logs, OBS-2 host game export that replays exactly, OBS-3 client error toasts with a code | `src/worker/room.ts`, `/api/rooms/:code/export`, `ErrorToasts.tsx` |
| Met (new) | OBS-4 local-only `/api/health` (version and time; it cannot list rooms, since a Worker has no index of Durable Objects) | `src/worker/index.ts` |
| Met (new) | UX-6 44 px touch targets on touch screens | `styles.css` |
| Met (new) | LIC-4 `THIRD_PARTY.md`, generated and checked | `scripts/third-party.mjs` |
| Met (new) | Testing gate: `npm run check` (typecheck, tests, build, e2e, third-party list, secret scan); version shown in the footer | `package.json`, `vite.config.ts` |
| Check | PERF-1 to 5, CAP-1, CAP-2, CAP-4, REL-5, UX-1, UX-2, UX-4, ENV-5 | Need a measured run or manual pass |
| Accepted | SEC-6 and ENV-6 / LIC-5: fonts keep loading from the Fontshare and Google CDNs (owner's call, 2026-11-24), so a game makes those requests and needs internet | No change planned |
| Gap | Coverage floors (engine 90%, projection 100%) | Needs `@vitest/coverage-v8` |
| Gap | SEC-7 "at most 3 open rooms per client" (the hourly creation limit covers spam instead); join limit raised from 10 to 120 per minute because a whole party shares one home IP | Owner's call |
| Gap | LIC-2 attribution terms for the ElevenLabs free plan; MCP-1 to 8 (headless access with login); release tags | Stage 2 follow-ups |
