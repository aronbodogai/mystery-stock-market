/**
 * MCP server (NFR-MCP-1..8): AI agents create rooms, join and play a whole game
 * headless at /mcp on this Worker, over Streamable HTTP (MCP TypeScript SDK v2,
 * stateless: a fresh McpServer per request, no sessions). Tools take the room
 * code and the seat token they were given; see roomSocket.ts for how a call
 * reaches the room and format.ts for what comes back.
 */
import { createMcpHandler, McpServer, originValidationResponse, type CallToolResult } from "@modelcontextprotocol/server";
import { env as workerEnv } from "cloudflare:workers";
import { z } from "zod";
import { PIECE_CASH, PRICE_FLOOR, START_CASH, START_PRICE, STOCK_IDS } from "../../engine/constants";
import { CURRENCY } from "../../shared/currency";
import { formatMoney } from "../../shared/format";
import { t } from "../../shared/i18n";
import { LANGS, type Lang } from "../../shared/lang";
import { cleanName } from "../../shared/names";
import { RoomConfigZ, type ClientMsg } from "../../shared/protocol";
import { authenticate } from "../access";
import { allow } from "../limiter";
import { json, newRoomCode } from "../util";
import { agentView, errorText, say, viewMarkdown, type ResponseFormat } from "./format";
import { act, GameError, sit, type Caller } from "./roomSocket";

declare const __APP_VERSION__: string | undefined;
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const SERVER_NAME = "mystery-stock-market-mcp-server";
export const MAX_WAIT_S = 30;

// ------------------------------------------------------------------ shared argument schemas

const RoomCodeArg = z.string().min(1).max(10).describe("Five-character room code, e.g. 'K7Q2M'");
const TokenArg = z.string().min(1).max(64).describe("Seat token from msm_create_room (host) or msm_join_room (player). Keep it secret.");
const LangArg = z.enum(LANGS).default("en").describe("Language of texts in the result: 'en', 'hu' or 'ko'");
const FormatArg = z.enum(["markdown", "json"]).default("markdown").describe("'markdown' for readable text, 'json' for structured data");
const SlotArg = z.number().int().min(0).max(STOCK_IDS.length - 1).describe("Stock slot on this board (stocks[].slot in the view), e.g. 0");
const NameArg = z.string().min(1).max(80).describe("Display name, 1-16 characters, unique in the room, e.g. 'Claude'");
const seatArgs = { room_code: RoomCodeArg, token: TokenArg, lang: LangArg, response_format: FormatArg };

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const SET = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { ...WRITE, destructiveHint: true } as const;

// ------------------------------------------------------------------ results

const text = (s: string): CallToolResult => ({ content: [{ type: "text", text: s }] });

/** Data as Markdown text, or as JSON text plus the same data as structuredContent. */
function result(format: ResponseFormat, data: Record<string, unknown>, markdown: () => string): CallToolResult {
  if (format === "json") return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  return text(markdown());
}

/** Runs a tool body; game errors come back as readable tool errors that say how to recover. */
async function run(lang: Lang, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GameError) return { ...text(errorText(lang, e.code, e.params)), isError: true };
    console.error(JSON.stringify({ ev: "mcp_error", message: String(e).slice(0, 300) }));
    return { ...text("Error: something went wrong on the server. Try again; if it keeps failing, report it to stocks@aroncreates.com."), isError: true };
  }
}

// ------------------------------------------------------------------ server factory

function createServer(caller: Caller, origin: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION },
    {
      instructions: `Mystery Stock Market: a multiplayer trading game where every stock moves by a hidden rule. A few words of each rule show at first; more are revealed in rounds 5, 10, 15 and 20. 24 rounds; the highest net worth wins.
Start: msm_create_room (you host; add bots to play alone) or msm_join_room with a code a person gives you. msm_get_rules has the full rules.
Each round: msm_get_view, then msm_trade / msm_place_secret / msm_use_piece, then msm_set_ready. Use msm_wait_for_change with the last version instead of polling.
You are labelled as an AI agent in the room and see exactly what a person in your seat sees.`,
    },
  );

  /** A tool that sends room messages from one seat and returns the fresh view. */
  function seatAction<S extends z.ZodRawShape>(
    name: string,
    meta: { title: string; description: string; annotations: typeof WRITE | typeof SET | typeof DESTRUCTIVE },
    shape: S,
    toMsgs: (args: z.infer<z.ZodObject<S>>) => ClientMsg[],
  ) {
    const schema = z.strictObject({ ...seatArgs, ...shape });
    type SeatBase = { room_code: string; token: string; lang: Lang; response_format: ResponseFormat };
    server.registerTool(name, { ...meta, inputSchema: schema }, async (raw: unknown) => {
      const args = raw as SeatBase;
      return run(args.lang, async () => {
        const { view, replies } = await act(caller, args.room_code, args.token, args.lang, toMsgs(raw as z.infer<z.ZodObject<S>>));
        const said = replies.flatMap((m) => (m.type === "toast" ? [say(args.lang, "toast", m.code, m.params ?? {}, view.companies)] : []));
        const v = await agentView(view, args.lang);
        return result(args.response_format, { ok: true, said, view: v }, () => [...said.map((s) => `> ${s}`), ...(said.length ? [""] : []), viewMarkdown(v, args.lang)].join("\n"));
      });
    });
  }

  // ---- reading

  server.registerTool(
    "msm_get_rules",
    {
      title: "Get game rules",
      description: "The full rules of Mystery Stock Market, as shown to people on the site. Read them once before your first game.",
      inputSchema: z.strictObject({ lang: LangArg }),
      annotations: READ,
    },
    async ({ lang }) => {
      const money = (n: number) => formatMoney(n, lang);
      const p = { symbol: CURRENCY.symbol, start: money(START_PRICE), cash: money(START_CASH), floor: money(PRICE_FLOOR), piece: money(PIECE_CASH), example: money(10_000) };
      const keys = ["how.currency", "how.basics", "how.rounds", "how.rules", "how.secret", "how.pieces", "how.end", "how.bots"] as const;
      return text([`# ${t(lang, "how.title")}`, ...keys.map((k, i) => `${i + 1}. ${t(lang, k, p)}`)].join("\n"));
    },
  );

  server.registerTool(
    "msm_get_view",
    {
      title: "Get room view",
      description: `Everything your seat can see now: phase, round and time left; each stock's price, change, recent prices, last round's buy/sell/hold volumes and the visible rule words; your cash, shares, pieces and secret; standings; recent events. Without a token you watch as a spectator.
Use msm_wait_for_change instead when you are waiting for something to happen.`,
      inputSchema: z.strictObject({ ...seatArgs, token: TokenArg.optional() }),
      annotations: READ,
    },
    async ({ room_code, token, lang, response_format }) =>
      run(lang, async () => {
        const { sock, view } = await sit(caller, room_code, token, lang);
        sock.close();
        const v = await agentView(view, lang);
        return result(response_format, v, () => viewMarkdown(v, lang));
      }),
  );

  server.registerTool(
    "msm_wait_for_change",
    {
      title: "Wait for a change",
      description: `Waits until the room changes (a player joins, the game starts, a trade or ready lands, a round settles) or ${MAX_WAIT_S} seconds pass, then returns the view and whether it changed.
Pass the version from the last view you saw: if the room already moved on, it returns at once, so nothing is missed between calls.
Example: after msm_set_ready, call this with that result's version until round increases.`,
      inputSchema: z.strictObject({
        ...seatArgs,
        version: z.string().max(32).optional().describe("The 'version' of the last view you saw"),
        timeout_seconds: z.number().int().min(1).max(MAX_WAIT_S).default(MAX_WAIT_S).describe(`Longest wait, 1-${MAX_WAIT_S} seconds`),
      }),
      annotations: READ,
    },
    async ({ room_code, token, lang, response_format, version, timeout_seconds }, ctx) =>
      run(lang, async () => {
        const { sock, view } = await sit(caller, room_code, token, lang);
        try {
          let v = await agentView(view, lang);
          let changed = !!version && version !== v.version;
          if (!changed && (await sock.waitForUpdate(timeout_seconds * 1000, ctx.mcpReq.signal))) {
            v = await agentView(await sock.view(lang), lang);
            changed = true;
          }
          return result(response_format, { changed, view: v }, () => `${changed ? "Changed." : `No change in ${timeout_seconds} s.`}\n\n${viewMarkdown(v, lang)}`);
        } finally {
          sock.close();
        }
      }),
  );

  // ---- joining

  server.registerTool(
    "msm_create_room",
    {
      title: "Create a room",
      description: `Creates a room with you as host (and as a player, unless msm_configure_room sets hostPlays false). Returns the room code, a join link for people, and your host token: pass it as 'token' to every other tool.
To play alone: msm_add_bots, then msm_start_game.`,
      inputSchema: z.strictObject({ name: NameArg, lang: LangArg, response_format: FormatArg }),
      annotations: WRITE,
    },
    async ({ name, lang, response_format }) =>
      run(lang, async () => {
        const clean = cleanName(name);
        if (!clean) throw new GameError("bad_name");
        if (!(await allow(caller.env, `account:${caller.account}`, "createRoom"))) throw new GameError("rate_limited");
        for (let attempt = 0; attempt < 8; attempt++) {
          const code = newRoomCode();
          const created = await caller.env.ROOM.getByName(code).init({ code, origin, hostName: clean, lang, agent: caller.account });
          if (!created) continue;
          const { view } = await act(caller, code, created.hostToken, lang, []);
          const v = await agentView(view, lang);
          return result(response_format, { room_code: code, token: created.hostToken, view: v }, () => `Room ${code} created. Your host token: ${created.hostToken}\n\n${viewMarkdown(v, lang)}`);
        }
        throw new GameError("try_again");
      }),
  );

  server.registerTool(
    "msm_join_room",
    {
      title: "Join a room",
      description: "Takes a seat in a room's lobby. Returns your seat token: pass it as 'token' to every other tool. Only works before the game starts and if the host allows AI agents.",
      inputSchema: z.strictObject({ room_code: RoomCodeArg, name: NameArg, lang: LangArg, response_format: FormatArg }),
      annotations: WRITE,
    },
    async ({ room_code, name, lang, response_format }) =>
      run(lang, async () => {
        const { sock } = await sit(caller, room_code, undefined, lang);
        try {
          const replies = await sock.exchange([{ type: "join", name }]);
          const err = replies.find((m) => m.type === "error");
          if (err && err.type === "error") throw new GameError(err.code, err.params);
          const welcome = replies.find((m) => m.type === "welcome");
          if (!welcome || welcome.type !== "welcome" || !welcome.token) throw new GameError("try_again");
          const v = await agentView(await sock.view(lang), lang);
          return result(response_format, { room_code: welcome.code, token: welcome.token, view: v }, () => `Joined room ${welcome.code}. Your token: ${welcome.token}\n\n${viewMarkdown(v, lang)}`);
        } finally {
          sock.close();
        }
      }),
  );

  // ---- playing a round

  seatAction(
    "msm_trade",
    {
      title: "Buy or sell shares",
      description: `Buys or sells whole shares of one stock at this round's price; prices only move when the round settles. Trading phase only.
Examples: buy 3 of slot 0 -> stock=0, side='buy', qty=3. Sell everything in slot 2 -> qty = me.shares[2].`,
      annotations: WRITE,
    },
    { stock: SlotArg, side: z.enum(["buy", "sell"]).describe("'buy' or 'sell'"), qty: z.number().int().min(1).max(1_000_000).describe("Number of shares, e.g. 5") },
    (a) => [{ type: "trade", stock: a.stock, side: a.side, qty: a.qty, seq: Date.now() }],
  );
  seatAction(
    "msm_place_secret",
    {
      title: "Hide a stock",
      description: "Once per game: hides one stock from everyone (price, volumes, chart) for the next two rounds. Anonymous. Anyone holding a hidden stock cannot see their own cash or net worth.",
      annotations: WRITE,
    },
    { stock: SlotArg },
    (a) => [{ type: "placeSecret", stock: a.stock }],
  );
  seatAction(
    "msm_use_piece",
    {
      title: "Use a piece",
      description: "Until round 20: spends one piece for cash (kind='cash'), or for a private look at the next hidden words of one stock's rule (kind='peek', with stock). Only you see what a peek reveals.",
      annotations: WRITE,
    },
    { kind: z.enum(["cash", "peek"]).describe("'cash' or 'peek'"), stock: SlotArg.optional().describe("Stock slot to peek at; required for 'peek'") },
    (a) => [{ type: "usePiece", kind: a.kind, ...(a.stock !== undefined ? { stock: a.stock } : {}) }],
  );
  seatAction(
    "msm_set_ready",
    {
      title: "Set ready",
      description: "Marks you done trading this round (ready=true) or not (ready=false). When every player is ready the round ends early. Then follow with msm_wait_for_change.",
      annotations: SET,
    },
    { ready: z.boolean().default(true).describe("true when done trading this round") },
    (a) => [{ type: "ready", value: a.ready }],
  );

  // ---- hosting (token = the host token from msm_create_room)

  seatAction(
    "msm_configure_room",
    {
      title: "Change room settings",
      description: `Host, lobby only: changes any of the room settings. Unset fields stay as they are.
Examples: no round timer -> {"roundSeconds": 0}; four companies -> {"ruleSet": "beginning"}; keep other agents out -> {"agents": false}.`,
      annotations: SET,
    },
    {
      settings: RoomConfigZ.partial()
        .strict()
        .describe(
          "ruleSet: show | random | beginning | season2 | grand; roundSeconds: 0 (no limit) | 60 | 120 | 180 | 300; endEarly; botSkill: easy | normal | hard; hostPlays; lang; seed (empty = random); agents (AI agents may join)",
        ),
    },
    (a) => [{ type: "setConfig", config: a.settings }],
  );
  seatAction(
    "msm_add_bots",
    { title: "Add bots", description: "Host, lobby only: adds bot players (2 seats are needed to start). Bots trade after people at the end of each round.", annotations: WRITE },
    { count: z.number().int().min(1).max(15).default(1).describe("How many bots to add, e.g. 2") },
    (a) => Array.from({ length: a.count }, () => ({ type: "addBot" }) as const),
  );
  seatAction(
    "msm_remove_bot",
    { title: "Remove a bot", description: "Host, lobby only: removes one bot, by player id or the last one added.", annotations: DESTRUCTIVE },
    { player_id: z.string().max(40).optional().describe("Bot's id from players[].id; omit for the last bot") },
    (a) => [{ type: "removeBot", ...(a.player_id ? { playerId: a.player_id } : {}) }],
  );
  seatAction(
    "msm_kick_player",
    { title: "Kick a player", description: "Host: removes a player in the lobby, or freezes their seat during a game. Cannot be undone for that seat.", annotations: DESTRUCTIVE },
    { player_id: z.string().max(40).describe("Player id from players[].id") },
    (a) => [{ type: "kick", playerId: a.player_id }],
  );
  seatAction(
    "msm_start_game",
    { title: "Start the game", description: "Host, lobby only: starts the game after a 5-second countdown. Needs at least 2 seats (add bots to play alone).", annotations: WRITE },
    {},
    () => [{ type: "start" }],
  );
  seatAction(
    "msm_end_round",
    { title: "End the round now", description: "Host: settles the current round immediately, without waiting for the timer or for everyone to be ready.", annotations: WRITE },
    {},
    () => [{ type: "endRound" }],
  );
  seatAction(
    "msm_new_game",
    { title: "Start a new game", description: "Host, after a game has finished: returns the room to the lobby with the same players for another game.", annotations: WRITE },
    {},
    () => [{ type: "newGame" }],
  );

  return server;
}

// ------------------------------------------------------------------ HTTP entry

/**
 * One stateless handler for the Worker. The login is checked first (access.ts);
 * the account rides to the factory in authInfo so each request builds its own server.
 */
const handler = createMcpHandler((ctx) => {
  const extra = ctx.authInfo?.extra as { account: string; origin: string } | undefined;
  if (!extra) throw new Error("unauthenticated request reached the MCP handler");
  return createServer({ env: workerEnv as Env, account: extra.account }, extra.origin);
});

export async function handleMcp(req: Request, env: Env, origin: string): Promise<Response> {
  // Browsers may only call from this site itself (MCP clients send no Origin).
  const blocked = originValidationResponse(req, [new URL(origin).hostname, "localhost", "127.0.0.1"]);
  if (blocked) return blocked;
  const auth = await authenticate(req, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status, auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="mcp"' } : {});
  return handler.fetch(req, {
    authInfo: { token: "access", clientId: "cloudflare-access", scopes: [], extra: { account: auth.identity.account, origin } },
  });
}
