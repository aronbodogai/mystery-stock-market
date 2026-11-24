/**
 * MCP server (NFR-MCP-1..8): AI agents create rooms, join and play a whole game
 * headless at /mcp on this Worker, over Streamable HTTP.
 *
 * Every tool call opens a short WebSocket to the Room Durable Object, exactly as
 * a phone does, so agents go through the same validation, rate limits, engine
 * and per-viewer projection as people (NFR-MCP-3). The socket is marked with the
 * logged-in account (AGENT_HEADER), which labels the seat as an AI agent, ties
 * it to that account and lets the host turn agent seats off (NFR-MCP-7).
 * The server is stateless: tools take the room code and seat token they were given.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { PIECE_CASH, PRICE_FLOOR, START_CASH, START_PRICE, STOCK_IDS } from "../engine/constants";
import { CURRENCY } from "../shared/currency";
import { formatMoney, formatNumber } from "../shared/format";
import { hasKey, t, type MsgKey, type Params } from "../shared/i18n";
import { LANGS, type Lang } from "../shared/lang";
import { cleanName } from "../shared/names";
import { LangZ, RoomConfigZ, type ClientMsg, type RuleToken, type ServerMsg, type View } from "../shared/protocol";
import { authenticate } from "./access";
import { allow } from "./limiter";
import { AGENT_HEADER } from "./room";
import { isRoomCode, json, newRoomCode } from "./util";

declare const __APP_VERSION__: string | undefined;
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const REPLY_TIMEOUT_MS = 5_000;
export const MAX_WAIT_S = 30;

class ToolError extends Error {
  constructor(
    public code: string,
    public params: Params = {},
  ) {
    super(code);
  }
}

// ------------------------------------------------------------------ room socket

/** One short-lived WebSocket to a Room, read as a queue of server messages. */
class RoomSocket {
  private queue: ServerMsg[] = [];
  private waiters: (() => void)[] = [];
  private closed = false;

  constructor(private ws: WebSocket) {
    ws.accept();
    ws.addEventListener("message", (e) => {
      try {
        this.queue.push(JSON.parse(typeof e.data === "string" ? e.data : "") as ServerMsg);
      } catch {
        /* not JSON: ignore */
      }
      this.wake();
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      this.wake();
    });
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** The next message, or null on timeout or close. */
  async next(timeoutMs: number): Promise<ServerMsg | null> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const m = this.queue.shift();
      if (m) return m;
      const left = end - Date.now();
      if (this.closed || left <= 0) return null;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Sends the messages, then a ping, and returns every reply up to the pong (the room handles messages in order). */
  async exchange(msgs: ClientMsg[]): Promise<ServerMsg[]> {
    for (const m of msgs) this.send(m);
    this.send({ type: "ping" });
    const out: ServerMsg[] = [];
    for (;;) {
      const m = await this.next(REPLY_TIMEOUT_MS);
      if (!m) {
        if (out.some((x) => x.type === "error")) return out; // e.g. kicked: the room closed the socket
        throw new ToolError(this.closed ? "room_closed" : "try_again");
      }
      if (m.type === "pong") return out;
      out.push(m);
    }
  }

  close(): void {
    try {
      this.ws.close(1000, "done");
    } catch {
      /* already closed */
    }
  }
}

interface Ctx {
  env: Env;
  account: string;
  origin: string;
}

async function openRoom(ctx: Ctx, code: string): Promise<RoomSocket> {
  const c = code.trim().toUpperCase();
  if (!isRoomCode(c)) throw new ToolError("bad_code");
  if (!(await allow(ctx.env, `account:${ctx.account}`, "connect"))) throw new ToolError("rate_limited");
  const res = await ctx.env.ROOM.getByName(c).fetch("https://room.internal/ws", {
    headers: { Upgrade: "websocket", [AGENT_HEADER]: ctx.account },
  });
  if (res.status === 404) throw new ToolError("not_found");
  if (res.status === 429) throw new ToolError("room_full");
  if (!res.webSocket) throw new ToolError("try_again");
  return new RoomSocket(res.webSocket);
}

const lastView = (msgs: ServerMsg[]): View | null => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.type === "view") return m.view;
  }
  return null;
};
const firstError = (msgs: ServerMsg[]) => msgs.find((m) => m.type === "error");

/** Opens a socket and says hello with the seat token (a player token or the host token). */
async function sit(ctx: Ctx, code: string, token: string | undefined, lang: Lang) {
  const sock = await openRoom(ctx, code);
  try {
    const hello = await sock.exchange([{ type: "hello", lang, ...(token ? { token, hostToken: token } : {}) }]);
    const err = firstError(hello);
    if (err) throw new ToolError(err.code, err.params);
    const view = lastView(hello);
    if (!view) throw new ToolError("try_again");
    return { sock, view };
  } catch (e) {
    sock.close();
    throw e;
  }
}

/** Runs room messages in one seat and returns the fresh view plus what the room said back. */
async function act(ctx: Ctx, code: string, token: string, lang: Lang, msgs: ClientMsg[]) {
  const { sock } = await sit(ctx, code, token, lang);
  try {
    const replies = await sock.exchange(msgs);
    const err = firstError(replies);
    if (err) throw new ToolError(err.code, err.params);
    const tail = await sock.exchange([{ type: "setLang", lang }]); // asks the room for a fresh view
    const view = lastView(tail) ?? lastView(replies);
    if (!view) throw new ToolError("try_again");
    return { view, replies };
  } finally {
    sock.close();
  }
}

// ------------------------------------------------------------------ agent-facing view

function say(lang: Lang, prefix: "ev" | "toast" | "err", code: string, params: Params, companies: readonly number[]): string {
  const p: Params = { ...params };
  if (typeof p.stock === "number") p.stock = t(lang, `stock.${STOCK_IDS[companies[p.stock] ?? p.stock]}` as MsgKey);
  if (typeof p.side === "string") p.side = t(lang, p.side === "buy" ? "trade.bought" : "trade.sold");
  if (typeof p.qty === "number") p.qty = formatNumber(p.qty, lang);
  const key = `${prefix}.${code}`;
  return hasKey(key) ? t(lang, key, p) : t(lang, `${prefix}.unknown` as MsgKey, { code });
}

const ruleText = (tokens: RuleToken[]) => tokens.map((x) => ("text" in x ? x.text : "[?]")).join("");

/** A version string for a view: changes whenever anything the seat can see changes. */
async function versionOf(view: View): Promise<string> {
  const { serverNow: _ignored, ...rest } = view;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rest)));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The seat's view, compacted for an agent: same information as the phone screen, names resolved, text in `lang`. */
async function agentView(view: View, lang: Lang) {
  const company = (slot: number) => t(lang, `stock.${STOCK_IDS[view.companies[slot] ?? slot]}` as MsgKey);
  const secondsTo = (at: number | null) => (at === null ? null : Math.max(0, Math.round((at - view.serverNow) / 1000)));
  return {
    version: await versionOf(view),
    room: view.code,
    joinUrl: `${view.origin}/j/${view.code}`,
    phase: view.phase,
    gameNo: view.gameNo,
    round: view.round,
    totalRounds: view.totalRounds,
    secondsLeft: view.phase === "trading" ? secondsTo(view.deadline) : null,
    countdownSeconds: view.phase === "countdown" ? secondsTo(view.countdownEnd) : null,
    endsEarlyInSeconds: secondsTo(view.earlyEndAt),
    revealLevel: view.revealLevel,
    nextRevealRound: view.nextReveal,
    you: view.you,
    config: view.config,
    seats: view.seats,
    players: view.lobby,
    stocks: view.stocks.map((s, slot) => ({
      slot,
      company: company(slot),
      price: s.price,
      change: s.delta,
      hidden: s.hidden,
      priceHistory: s.chart,
      lastRound: s.last,
      rule: ruleText(s.rule),
      ruleLevel: s.level,
    })),
    me: view.me,
    standings: view.standings,
    ready: view.ready,
    anySecret: view.anySecret,
    events: view.events.slice(-10).map((e) => ({ ...e, text: say(lang, "ev", e.code, e.params, view.companies) })),
    results: view.results && {
      seed: view.results.seed,
      ruleSet: view.results.ruleSet,
      rules: view.results.rules.map((tokens, slot) => ({ slot, company: company(slot), rule: tokens.map((x) => x.text).join("") })),
      ranking: view.results.ranking,
    },
  };
}

// ------------------------------------------------------------------ tools

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });

async function run(lang: Lang, fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    const code = e instanceof ToolError ? e.code : "unknown";
    const params = e instanceof ToolError ? e.params : { code: "internal" };
    if (!(e instanceof ToolError)) console.error(JSON.stringify({ ev: "mcp_error", message: String(e).slice(0, 300) }));
    return { content: [{ type: "text", text: JSON.stringify({ error: code, message: say(lang, "err", code, params, []) }) }], isError: true };
  }
}

const RoomCodeZ = z.string().describe("Five-character room code, e.g. K7Q2M");
const TokenZ = z.string().min(1).max(64).describe("Seat token from create_room or join_room. Keep it secret.");
const LangArgZ = LangZ.default("en").describe(`Language for texts in the result: ${LANGS.join(", ")}`);
const SlotZ = z.number().int().min(0).max(STOCK_IDS.length - 1).describe("Stock slot on this board (stocks[].slot)");

const INSTRUCTIONS = `Mystery Stock Market: a multiplayer trading game with hidden rules. Each stock moves by a secret rule; a few words are shown at first and more are revealed in rounds 5, 10, 15 and 20. 24 rounds; highest net worth wins.
Flow: create_room (you are host) or join_room with a code. As host: configure, add_bot, start_game. Each round: read get_view, trade / place_secret / use_piece, then set_ready. Use wait_for_change (pass the last version) instead of polling. Call how_to_play for the full rules.
You are labelled as an AI agent in the room and see exactly what a human sees in your seat.`;

export function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "mystery-stock-market", version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "how_to_play",
    { description: "The full game rules, as shown to people on the site.", inputSchema: z.object({ lang: LangArgZ }) },
    ({ lang }) =>
      run(lang, async () => {
        const money = (n: number) => formatMoney(n, lang);
        const p = { symbol: CURRENCY.symbol, start: money(START_PRICE), cash: money(START_CASH), floor: money(PRICE_FLOOR), piece: money(PIECE_CASH), example: money(10_000) };
        const keys = ["how.currency", "how.basics", "how.rounds", "how.rules", "how.secret", "how.pieces", "how.end", "how.bots"] as const;
        return { rules: keys.map((k) => t(lang, k, p)) };
      }),
  );

  server.registerTool(
    "create_room",
    {
      description: "Create a room. You become its host (and a player, unless configure sets hostPlays false). Returns the room code and your token.",
      inputSchema: z.object({ name: z.string().max(80).describe("Your display name (1-16 characters)"), lang: LangArgZ }),
    },
    ({ name, lang }) =>
      run(lang, async () => {
        const clean = cleanName(name);
        if (!clean) throw new ToolError("bad_name");
        if (!(await allow(ctx.env, `account:${ctx.account}`, "createRoom"))) throw new ToolError("rate_limited");
        for (let attempt = 0; attempt < 8; attempt++) {
          const code = newRoomCode();
          const created = await ctx.env.ROOM.getByName(code).init({ code, origin: ctx.origin, hostName: clean, lang, agent: ctx.account });
          if (created) {
            const { view } = await act(ctx, code, created.hostToken, lang, []);
            return { room: code, token: created.hostToken, view: await agentView(view, lang) };
          }
        }
        throw new ToolError("try_again");
      }),
  );

  server.registerTool(
    "join_room",
    {
      description: "Join a room's lobby as a player. Returns your seat token; pass it to every other tool.",
      inputSchema: z.object({ room: RoomCodeZ, name: z.string().max(80).describe("Your display name (1-16 characters)"), lang: LangArgZ }),
    },
    ({ room, name, lang }) =>
      run(lang, async () => {
        const { sock } = await sit(ctx, room, undefined, lang);
        try {
          const replies = await sock.exchange([{ type: "join", name }]);
          const err = firstError(replies);
          if (err) throw new ToolError(err.code, err.params);
          const welcome = replies.find((m) => m.type === "welcome");
          if (!welcome || welcome.type !== "welcome" || !welcome.token) throw new ToolError("try_again");
          const view = lastView(await sock.exchange([{ type: "setLang", lang }]));
          return { room: welcome.code, token: welcome.token, view: view && (await agentView(view, lang)) };
        } finally {
          sock.close();
        }
      }),
  );

  server.registerTool(
    "get_view",
    {
      description: "Everything your seat can see now: phase, round, time left, prices, price history, rule words, your cash and shares, standings, recent events.",
      inputSchema: z.object({ room: RoomCodeZ, token: TokenZ, lang: LangArgZ }),
    },
    ({ room, token, lang }) =>
      run(lang, async () => {
        const { sock, view } = await sit(ctx, room, token, lang);
        sock.close();
        return agentView(view, lang);
      }),
  );

  server.registerTool(
    "wait_for_change",
    {
      description: `Waits until the room changes (a trade lands, a round settles, someone joins, the game starts...) or ${MAX_WAIT_S} seconds pass. Pass the version from your last view so nothing is missed between calls.`,
      inputSchema: z.object({
        room: RoomCodeZ,
        token: TokenZ,
        version: z.string().max(32).optional().describe("version from the last view you saw"),
        timeoutSeconds: z.number().int().min(1).max(MAX_WAIT_S).default(MAX_WAIT_S),
        lang: LangArgZ,
      }),
    },
    ({ room, token, version, timeoutSeconds, lang }) =>
      run(lang, async () => {
        const { sock, view } = await sit(ctx, room, token, lang);
        try {
          const first = await agentView(view, lang);
          if (version && version !== first.version) return { changed: true, view: first };
          const m = await waitForUpdate(sock, timeoutSeconds * 1000);
          if (!m) return { changed: false, view: first };
          const fresh = lastView(await sock.exchange([{ type: "setLang", lang }])) ?? view;
          return { changed: true, view: await agentView(fresh, lang) };
        } finally {
          sock.close();
        }
      }),
  );

  const playTool = (name: string, description: string, shape: z.ZodRawShape, toMsgs: (a: Record<string, unknown>) => ClientMsg[]) =>
    server.registerTool(
      name,
      { description, inputSchema: z.object({ room: RoomCodeZ, token: TokenZ, ...shape, lang: LangArgZ }) },
      (args: Record<string, unknown>) => {
        const lang = args.lang as Lang;
        return run(lang, async () => {
          const { view, replies } = await act(ctx, args.room as string, args.token as string, lang, toMsgs(args));
          const toasts = replies.flatMap((m) => (m.type === "toast" ? [say(lang, "toast", m.code, m.params ?? {}, view.companies)] : []));
          return { ok: true, said: toasts, view: await agentView(view, lang) };
        });
      },
    );

  playTool(
    "trade",
    "Buy or sell whole shares at this round's price (prices only move when the round settles).",
    { stock: SlotZ, side: z.enum(["buy", "sell"]), qty: z.number().int().min(1).max(1_000_000) },
    (a) => [{ type: "trade", stock: a.stock as number, side: a.side as "buy" | "sell", qty: a.qty as number, seq: Date.now() }],
  );
  playTool("place_secret", "Once per game: hide one stock from everyone for the next two rounds.", { stock: SlotZ }, (a) => [
    { type: "placeSecret", stock: a.stock as number },
  ]);
  playTool(
    "use_piece",
    "Until round 20: spend a piece for cash, or for a private peek at the next hidden words of one stock's rule.",
    { kind: z.enum(["cash", "peek"]), stock: SlotZ.optional().describe("Required for peek") },
    (a) => [{ type: "usePiece", kind: a.kind as "cash" | "peek", ...(a.stock !== undefined ? { stock: a.stock as number } : {}) }],
  );
  playTool("set_ready", "Mark yourself done trading for this round (or not). When every player is ready the round can end early.", { ready: z.boolean().default(true) }, (a) => [
    { type: "ready", value: a.ready as boolean },
  ]);

  // Host tools: the token must be the host token from create_room.
  playTool(
    "configure",
    "Host, lobby only: change room settings. agents=false stops more AI agents from joining.",
    { config: RoomConfigZ.partial().describe("Any of: ruleSet, roundSeconds (0 = no limit), endEarly, botSkill, hostPlays, lang, seed, agents") },
    (a) => [{ type: "setConfig", config: a.config as Partial<z.infer<typeof RoomConfigZ>> }],
  );
  playTool("add_bot", "Host, lobby only: add a bot player.", { count: z.number().int().min(1).max(15).default(1) }, (a) =>
    Array.from({ length: a.count as number }, () => ({ type: "addBot" }) as const),
  );
  playTool("remove_bot", "Host, lobby only: remove a bot (the last one, or by player id).", { playerId: z.string().max(40).optional() }, (a) => [
    { type: "removeBot", ...(a.playerId ? { playerId: a.playerId as string } : {}) },
  ]);
  playTool("kick", "Host: remove a player (lobby) or freeze their seat (in a game).", { playerId: z.string().max(40) }, (a) => [
    { type: "kick", playerId: a.playerId as string },
  ]);
  playTool("start_game", "Host, lobby only: start the game (needs at least 2 seats; add bots to play alone).", {}, () => [{ type: "start" }]);
  playTool("end_round", "Host: settle the current round now.", {}, () => [{ type: "endRound" }]);
  playTool("new_game", "Host, after a game: back to the lobby with the same players.", {}, () => [{ type: "newGame" }]);

  return server;
}

/** Waits for the room to push something new to this seat. */
async function waitForUpdate(sock: RoomSocket, ms: number): Promise<ServerMsg | null> {
  const end = Date.now() + ms;
  for (;;) {
    const m = await sock.next(end - Date.now());
    if (!m) return null;
    if (m.type === "view" || m.type === "patch" || m.type === "settled") return m;
    if (m.type === "error") throw new ToolError(m.code, m.params);
  }
}

// ------------------------------------------------------------------ HTTP entry

export async function handleMcp(req: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const auth = await authenticate(req, env);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="mcp"' } : {});
  }
  const handler = createMcpHandler(() => buildServer({ env, account: auth.identity.account, origin }), {
    route: "/mcp",
    corsOptions: false,
  });
  return handler(req, env, ctx);
}
