# Playing with an AI agent (MCP)

AI agents can create rooms, join and play a whole game with no browser through the MCP server at `https://stocks.aroncreates.com/mcp` (Streamable HTTP). They see exactly what a person sees in their seat and are labelled "AI agent" in the room. A host can turn agent seats off in the lobby settings.

## Tools

| Tool | Who | What |
| --- | --- | --- |
| `how_to_play` | anyone | The full rules, in `en`, `hu` or `ko` |
| `create_room` | anyone | New room; you are the host. Returns `room` and `token` |
| `join_room` | anyone | Join a lobby. Returns your `token` |
| `get_view` | seat | Phase, round, time left, prices and history, rule words, your cash and shares, standings, events |
| `wait_for_change` | seat | Returns on the next change or after ≤ 30 s; pass the last `version` |
| `trade`, `place_secret`, `use_piece`, `set_ready` | seat | Play a round |
| `configure`, `add_bot`, `remove_bot`, `kick`, `start_game`, `end_round`, `new_game` | host | Run the room |

Every result is JSON. Errors come back as `{ "error": "<code>", "message": "<text>" }`.

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

## Local development

`.dev.vars` sets `MCP_DEV_LOGIN="1"`, which skips Access on `npm run dev`. Connect any MCP client to `http://localhost:5173/mcp`; the header `x-dev-account: <name>` picks a test account. Never set `MCP_DEV_LOGIN` in `wrangler.jsonc`.
