# Playing with an AI agent (MCP)

AI agents can create rooms, join and play a whole game with no browser through the MCP server `mystery-stock-market-mcp-server` at `https://stocks.aroncreates.com/mcp` (Streamable HTTP, stateless). They see exactly what a person sees in their seat and are labelled "AI agent" in the room. A host can turn agent seats off in the lobby settings.

## Tools

All tools start with `msm_`, take snake_case arguments and reject unknown ones. Tools that return a view take `response_format`: `markdown` (default, readable, ends with the next useful calls) or `json` (the same data as `structuredContent` and as JSON text). `lang` picks the language of texts: `en`, `hu` or `ko`.

| Tool | Who | Annotations | What |
| --- | --- | --- | --- |
| `msm_get_rules` | anyone | read-only | The full rules |
| `msm_create_room` | anyone | | New room; you are the host. Returns `room_code` and `token` |
| `msm_join_room` | anyone | | Take a seat in a lobby. Returns your `token` |
| `msm_get_view` | seat, or spectator without a token | read-only | Phase, round, time left, prices and history, volumes, rule words, your cash and shares, standings, events |
| `msm_wait_for_change` | seat | read-only | Returns on the next change or after ≤ 30 s; pass the last `version`. Cancellable |
| `msm_trade`, `msm_place_secret`, `msm_use_piece`, `msm_set_ready` | seat | | Play a round |
| `msm_configure_room`, `msm_add_bots`, `msm_start_game`, `msm_end_round`, `msm_new_game` | host | | Run the room |
| `msm_remove_bot`, `msm_kick_player` | host | destructive | Remove a bot or player |

Errors are tool results with `isError: true` and text `Error (<code>): <what went wrong>. <how to recover>`, e.g. `Error (not_trading): Trading is closed right now. Call msm_wait_for_change until phase is trading.`

A typical solo game: `msm_create_room` → `msm_add_bots` (count 2) → `msm_start_game` → each round `msm_get_view`, `msm_trade`, `msm_set_ready`, `msm_wait_for_change` until the round number goes up.

## Limits

- Per logged-in account: 5 rooms created and 120 tool calls per minute (each call is one room connection). Within a call the room's 20 messages per second limit applies, as for phones.
- Tool calls take 30–70 ms locally; `msm_wait_for_change` up to 30 s.

## Login: Cloudflare Access setup (once)

The `/mcp` path is protected by Cloudflare Zero Trust Access with Managed OAuth. An MCP client that connects gets a 401 from Access, opens the browser for the login, and then sends an access token with every call. Browser play stays open to everyone.

1. Zero Trust dashboard → **Access controls → Applications → Create new application → Self-hosted** (or **MCP server** if offered).
2. Name it (e.g. "Mystery Stock Market MCP"). Public hostname: `stocks.aroncreates.com`, path `mcp`. Only this path: the rest of the site must stay public.
3. Add a policy: **Allow**, include who may play. For anyone with an email address: login method One-time PIN and selector **Everyone**. For a closed group: list their emails.
4. **Advanced settings → Managed OAuth**: turn on. Save.
5. Copy the **Application Audience (AUD) tag** from the application's overview, and your Zero Trust team name (in the Zero Trust settings), which gives the team domain `https://<team>.cloudflareaccess.com`.
6. Put both in `wrangler.jsonc` under `vars` (they are not secrets): `"ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com"`, `"ACCESS_AUD": "<aud tag>"`. Merge to deploy.

Until step 6 is deployed, `/mcp` answers 503 `login_not_configured` to every call.

Check it: `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL `https://stocks.aroncreates.com/mcp`. It should open the Access login, then list the tools. Without a login, `curl -i -X POST https://stocks.aroncreates.com/mcp` gets 401.

## Security

- The Worker checks the Access JWT (`Cf-Access-Jwt-Assertion`: signature against the team's keys, audience, issuer, expiry) on every request, so a request that bypassed Access is refused.
- Browser requests from other sites are refused (Origin check); MCP clients send no Origin.
- The account is stored only as a hash. A seat token works only for the account that took the seat, and only over MCP.
- The public WebSocket route strips the agent marker, so a browser cannot pose as an agent.

## Local development and evaluation

`.dev.vars` sets `MCP_DEV_LOGIN="1"`, which skips Access on `npm run dev`. Connect any MCP client to `http://localhost:5173/mcp`; the header `x-dev-account: <name>` picks a test account. Never set `MCP_DEV_LOGIN` in `wrangler.jsonc`.

`docs/mcp-evaluation.xml` holds 10 questions for the mcp-builder evaluation script (rules only: rooms are live and short-lived, so nothing else is stable). `test/worker/mcp.test.ts` plays a whole game through the MCP client.
