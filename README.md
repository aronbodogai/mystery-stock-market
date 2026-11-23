# Mystery Stock Market

A real-time multiplayer party game for 2–16 players: trade seven mystery stocks for 24 rounds while the hidden price rules reveal themselves word by word. Phones are the controllers, any TV with a browser is the board. Inspired by the "Mystery Stock Market" match from *The Devil's Plan: Dead Again*.

- Spec: [SPEC.md](SPEC.md) · Visual design: [design.md](design.md)
- Choices not covered by the spec: [DECISIONS.md](DECISIONS.md)
- Hungarian / Korean strings to review: [I18N_REVIEW.md](I18N_REVIEW.md)

Production domain: **https://stocks.aroncreates.com**

## Stack

One Cloudflare Worker project, nothing else:

| Piece | What |
|---|---|
| `src/engine/` | Pure TypeScript game engine: seeded RNG, rules, `settle()`, bots, replay, `project()` (per-viewer information hiding). No DOM or Workers APIs. |
| `src/shared/` | zod protocol, i18n catalogs (`en`, `hu`, `ko`), per-locale rule templates, money formatting, currency. |
| `src/worker/` | Router (`/api/*`, `/ws/*`), `Room` and `TvPairing` Durable Objects (SQLite-backed, WebSocket hibernation, alarms). |
| `src/client/` | Vite + React SPA: home, join, room (lobby → trading → results, host controls), TV, pairing, solo. |

## Develop

```powershell
npm install
npm run dev
```

Opens on http://localhost:5173 with the Worker and Durable Objects running locally (Cloudflare Vite plugin). To try it with phones on your Wi-Fi, run `npx vite --host 0.0.0.0` and open `http://<your-LAN-IP>:5173`; join links and QR codes use the address you opened.

## Test

```powershell
npm test
```

Runs the engine + projection tests (Node) and the Durable Object tests (workerd). The end-to-end test (host + two players + TV, with WebSocket frame inspection) uses your installed Chrome:

```powershell
npm run test:e2e
```

## Deploy

Needs a Cloudflare account where `aroncreates.com` is an active zone. `wrangler.jsonc` attaches the Worker to `stocks.aroncreates.com` as a Custom Domain (DNS record and certificate are created automatically).

```powershell
npx wrangler login
```

```powershell
npm run deploy
```

`npm run deploy` type-checks, builds the client and Worker, and runs `wrangler deploy`. Rooms live in Durable Objects, so a deploy mid-game keeps the game; clients reconnect automatically.
