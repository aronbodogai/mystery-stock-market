import { DurableObject } from "cloudflare:workers";
import {
  applyAction,
  createGame,
  DEFAULT_CONFIG,
  hiddenMask,
  MAX_DISPLAYS,
  MAX_SEATS,
  MAX_SPECTATORS,
  MIN_SEATS,
  project,
  projectDeltas,
  projectMeFor,
  pushEvent,
  randomSeed,
  readyPool,
  REVEAL_ROUNDS,
  seatedPlayers,
  settleRound,
  findSeat,
  type Action,
  type GameInit,
  type RoomState,
  type Viewer,
  GAME_MAX_MS,
} from "../engine";
import type { Lang } from "../shared/lang";
import { BOT_NAMES, cleanName, sameName } from "../shared/names";
import { ClientMsgZ, HOST_ONLY, type ClientMsg, type Role, type ServerMsg } from "../shared/protocol";
import { newId, newToken, safeEqual } from "./util";

/** Per-socket state. Lives in the socket attachment so it survives hibernation. */
interface Attachment {
  hello: boolean;
  role: Role;
  playerId: string | null;
  displayId: string | null;
  lang: Lang;
  /** Set only on sockets the MCP server opens: hash of the logged-in account (see mcp.ts). */
  agent?: string | null;
}

/** Header the MCP server uses to mark its sockets. The public WebSocket route strips it. */
export const AGENT_HEADER = "x-msm-agent";
/** An agent seat counts as connected this long after its last tool call. */
const AGENT_PRESENCE_MS = 60_000;

const COUNTDOWN_MS = 5_000;
const EARLY_END_MS = 3_000;
/** A lobby nobody touches for this long is closed (NFR-SEC-7: no piles of empty rooms). */
const LOBBY_IDLE_MS = 30 * 60 * 1000;
const FINISHED_TTL_MS = 60 * 60 * 1000;
const RATE_PER_SEC = 20;
const MAX_SOCKETS = 64;
const MAX_MESSAGE_BYTES = 4096;

type Params = Record<string, string | number>;
type PairResult = { ok: true } | { ok: false; code: string };

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  private rate = new WeakMap<WebSocket, { win: number; n: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>("room")) ?? null;
    });
  }

  // ------------------------------------------------------------------ RPC

  /** Create the room. Returns null if this code is already in use. */
  async init(p: { code: string; origin: string; hostName: string; lang: Lang; agent?: string }) {
    if (this.room) return null;
    const now = Date.now();
    const hostId = newId();
    const playerToken = newToken();
    const hostToken = newToken();
    this.room = {
      v: 1,
      code: p.code,
      origin: p.origin,
      createdAt: now,
      hostToken,
      hostId,
      config: { ...DEFAULT_CONFIG, lang: p.lang },
      players: [
        {
          id: hostId,
          name: p.hostName,
          token: playerToken,
          bot: false,
          kicked: false,
          ready: false,
          lastSeq: 0,
          ...(p.agent ? { agent: p.agent, seenAt: now } : {}),
        },
      ],
      displays: [],
      phase: "lobby",
      countdownEnd: null,
      deadline: null,
      pausedRemaining: null,
      earlyEndAt: null,
      gameEndsAt: null,
      game: null,
      gameInit: null,
      gameNo: 0,
      events: [],
      eventSeq: 0,
      lastActivity: now,
      finishedAt: null,
    };
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, game INTEGER NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL)",
    );
    await this.save();
    await this.schedule();
    this.log("create");
    return { hostToken, playerId: hostId, playerToken };
  }

  async info(): Promise<{ exists: boolean; phase: string | null }> {
    return { exists: this.room !== null, phase: this.room?.phase ?? null };
  }

  /** HTTP pairing from /pair/:code on the host's phone. */
  async pairWithHostToken(hostToken: string, pairCode: string): Promise<PairResult> {
    if (!this.room) return { ok: false, code: "not_found" };
    if (!safeEqual(hostToken, this.room.hostToken)) return { ok: false, code: "not_host" };
    return this.pairTv(pairCode);
  }

  /**
   * The finished game as a file the host can download (NFR-OBS-2): seed, seats
   * and every accepted action, enough to replay it exactly in a test. Finished
   * games only, so it never reveals anything still hidden.
   */
  async exportGame(hostToken: string): Promise<{ ok: boolean; code?: string; file?: string }> {
    const r = this.room;
    if (!r) return { ok: false, code: "not_found" };
    if (!safeEqual(hostToken, r.hostToken)) return { ok: false, code: "not_host" };
    if (r.phase !== "finished" || !r.gameInit) return { ok: false, code: "not_finished" };
    this.log("export");
    const file = { format: "msm-game-v1", room: r.code, gameNo: r.gameNo, init: r.gameInit, actions: await this.actionLog() };
    return { ok: true, file: JSON.stringify(file, null, 2) };
  }

  /** Test/debug helper: the persisted action log for the current game. */
  async actionLog(): Promise<Action[]> {
    if (!this.room) return [];
    return this.ctx.storage.sql
      .exec<{ action: string }>("SELECT action FROM log WHERE game = ? ORDER BY id", this.room.gameNo)
      .toArray()
      .map((r) => JSON.parse(r.action) as Action);
  }

  // ------------------------------------------------------------------ sockets

  override async fetch(request: Request): Promise<Response> {
    if (!this.room) return new Response("Room not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("Room busy", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const agent = request.headers.get(AGENT_HEADER) || null;
    const att: Attachment = { hello: false, role: "guest", playerId: null, displayId: null, lang: this.room.config.lang, agent };
    server.serializeAttachment(att);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) {
      this.close(ws, 4404, "room_closed");
      return;
    }
    if (!this.allow(ws)) return;
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return this.err(ws, "bad_message");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return this.err(ws, "bad_message");
    }
    const parsed = ClientMsgZ.safeParse(data);
    if (!parsed.success) return this.err(ws, "bad_message");
    const msg = parsed.data;
    const att = this.att(ws);
    if (msg.type === "ping") return this.send(ws, { type: "pong", serverNow: Date.now() });
    if (!att.hello && msg.type !== "hello") return this.err(ws, "hello_first");
    if (HOST_ONLY.has(msg.type) && att.role !== "host") return this.err(ws, "not_host");
    if (att.agent && att.playerId) {
      const p = this.room.players.find((x) => x.id === att.playerId);
      if (p) p.seenAt = Date.now();
    }
    await this.handle(ws, att, msg);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1000, reason);
    } catch {
      /* already closed */
    }
    await this.onDisconnect(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onDisconnect(ws);
  }

  private async onDisconnect(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    const att = this.att(ws);
    if (att.playerId && (att.role === "player" || att.role === "host")) {
      this.checkEarlyEnd(ws);
      await this.save();
      await this.schedule();
      this.broadcast(ws);
    }
  }

  // ------------------------------------------------------------------ alarms

  override async alarm(): Promise<void> {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    // Hard cap: a game never runs longer than GAME_MAX_MS, so every room's state gets cleaned up.
    if (this.inGame() && r.gameEndsAt != null && r.gameEndsAt <= now) {
      this.applyLogged({ t: "end" });
      pushEvent(r, "ev_time_limit", { hours: GAME_MAX_MS / 3_600_000 });
      this.finish();
      return this.commit();
    }
    if (r.phase === "countdown" && r.countdownEnd !== null && r.countdownEnd <= now) {
      r.phase = "trading";
      r.countdownEnd = null;
      r.deadline = this.roundDeadline(now);
      await this.save();
      await this.schedule();
      this.broadcast();
      return;
    }
    if (r.phase === "trading") {
      if (r.earlyEndAt !== null && r.earlyEndAt <= now) {
        // Re-check: someone may have left since the countdown started.
        const pool = readyPool(r, this.connectedIds());
        if (pool.total > 0 && pool.count === pool.total) return this.settle();
        r.earlyEndAt = null;
      }
      if (r.deadline !== null && r.deadline <= now) return this.settle();
    }
    const cleanupAt = this.cleanupAt();
    if (cleanupAt !== null && cleanupAt <= now) return this.cleanup();
    await this.save();
    await this.schedule();
    this.broadcast();
  }

  private cleanupAt(): number | null {
    const r = this.room;
    if (!r) return null;
    if (r.phase === "lobby") return r.lastActivity + LOBBY_IDLE_MS;
    if (r.phase === "finished") return (r.finishedAt ?? r.lastActivity) + FINISHED_TTL_MS;
    return null; // games in progress end at gameEndsAt at the latest, then this rule applies
  }

  private inGame(): boolean {
    const p = this.room?.phase;
    return p === "countdown" || p === "trading" || p === "paused";
  }

  /** Deadline for a new round, or null for "no limit" rounds (they end when everyone is ready). */
  private roundDeadline(now: number): number | null {
    const s = this.room!.config.roundSeconds;
    return s > 0 ? now + s * 1000 : null;
  }

  /** One alarm per object: always set it to the earliest upcoming event. */
  private async schedule(): Promise<void> {
    const r = this.room;
    if (!r) return;
    const times: number[] = [];
    if (r.phase === "countdown" && r.countdownEnd !== null) times.push(r.countdownEnd);
    if (r.phase === "trading") {
      if (r.deadline !== null) times.push(r.deadline);
      if (r.earlyEndAt !== null) times.push(r.earlyEndAt);
    }
    if (this.inGame() && r.gameEndsAt != null) times.push(r.gameEndsAt);
    const c = this.cleanupAt();
    if (c !== null) times.push(c);
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    else await this.ctx.storage.deleteAlarm();
  }

  private async cleanup(): Promise<void> {
    this.log("cleanup");
    for (const ws of this.ctx.getWebSockets()) {
      this.err(ws, "room_closed");
      this.close(ws, 4404, "room_closed");
    }
    this.room = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ------------------------------------------------------------------ dispatch

  private async handle(ws: WebSocket, att: Attachment, msg: ClientMsg): Promise<void> {
    const r = this.room!;
    switch (msg.type) {
      case "hello":
        return this.hello(ws, msg);
      case "setLang":
        att.lang = msg.lang;
        ws.serializeAttachment(att);
        return this.sendView(ws);
      case "join":
        return this.join(ws, att, msg.name);
      case "trade":
      case "placeSecret":
      case "usePiece":
        return this.playerAction(ws, att, msg);
      case "ready":
        return this.ready(ws, att, msg.value);
      case "setConfig": {
        if (r.phase !== "lobby") return this.err(ws, "lobby_only");
        const next = { ...r.config, ...msg.config };
        next.seed = next.seed.trim();
        r.config = next;
        return this.commit();
      }
      case "addBot": {
        if (r.phase !== "lobby") return this.err(ws, "lobby_only");
        if (seatedPlayers(r).length >= MAX_SEATS) return this.err(ws, "room_full");
        const taken = (n: string) => r.players.some((p) => !p.kicked && sameName(p.name, n));
        const name = BOT_NAMES.find((n) => !taken(n)) ?? `Bot ${r.players.length + 1}`;
        r.players.push({ id: newId(), name, token: null, bot: true, kicked: false, ready: false, lastSeq: 0 });
        return this.commit();
      }
      case "removeBot": {
        if (r.phase !== "lobby") return this.err(ws, "lobby_only");
        const bots = r.players.filter((p) => p.bot);
        const target = msg.playerId ? bots.find((b) => b.id === msg.playerId) : bots[bots.length - 1];
        if (!target) return this.err(ws, "bad_target");
        r.players = r.players.filter((p) => p !== target);
        return this.commit();
      }
      case "kick":
        return this.kick(ws, msg.playerId);
      case "start":
        return this.start(ws);
      case "pause": {
        if (r.phase !== "trading") return this.err(ws, "not_trading");
        // No-limit rounds have no deadline to remember.
        r.pausedRemaining = r.deadline === null ? null : Math.max(0, r.deadline - Date.now());
        r.deadline = null;
        r.earlyEndAt = null;
        r.phase = "paused";
        pushEvent(r, "ev_paused");
        return this.commit();
      }
      case "resume": {
        if (r.phase !== "paused") return this.err(ws, "not_paused");
        r.deadline = r.pausedRemaining !== null ? Date.now() + r.pausedRemaining : this.roundDeadline(Date.now());
        r.pausedRemaining = null;
        r.phase = "trading";
        pushEvent(r, "ev_resumed");
        this.checkEarlyEnd();
        return this.commit();
      }
      case "endRound":
        if (r.phase !== "trading" && r.phase !== "paused") return this.err(ws, "not_trading");
        return this.settle();
      case "endGame": {
        if (!r.game || r.phase === "lobby" || r.phase === "finished") return this.err(ws, "not_trading");
        this.applyLogged({ t: "end" });
        this.finish();
        return this.commit();
      }
      case "newGame": {
        if (r.phase !== "finished") return this.err(ws, "not_finished");
        r.players = r.players.filter((p) => !p.kicked);
        for (const p of r.players) p.ready = false;
        r.game = null;
        r.gameInit = null;
        r.phase = "lobby";
        r.events = [];
        r.deadline = r.countdownEnd = r.pausedRemaining = r.earlyEndAt = r.finishedAt = r.gameEndsAt = null;
        return this.commit();
      }
      case "pairTv": {
        const res = await this.pairTv(msg.pairCode);
        if (!res.ok) return this.err(ws, res.code);
        return this.toast(ws, "tv_paired");
      }
      case "unpairTv": {
        const d = r.displays.find((x) => x.id === msg.displayId);
        if (!d) return this.err(ws, "bad_target");
        r.displays = r.displays.filter((x) => x !== d);
        for (const s of this.ctx.getWebSockets()) {
          if (this.att(s).displayId === d.id) {
            this.err(s, "unpaired");
            this.close(s, 4401, "unpaired");
          }
        }
        return this.commit();
      }
      case "transferHost":
        return this.transferHost(ws, msg.playerId);
      case "ping":
        return;
    }
  }

  private async hello(ws: WebSocket, msg: Extract<ClientMsg, { type: "hello" }>): Promise<void> {
    const r = this.room!;
    const agent = this.att(ws).agent ?? null;
    // An agent's seat works only for the account that took it, and only over MCP (NFR-MCP-8).
    const ownedBy = (id: string) => (r.players.find((p) => p.id === id)?.agent ?? null) === agent;
    const found = msg.token ? r.players.find((p) => p.token !== null && safeEqual(p.token, msg.token)) : undefined;
    const player = found && ownedBy(found.id) ? found : undefined;
    const display = !found && !agent && msg.token ? r.displays.find((d) => safeEqual(d.token, msg.token)) : undefined;
    const hostOk = !!msg.hostToken && safeEqual(msg.hostToken, r.hostToken) && ownedBy(r.hostId);
    if (player?.kicked && !hostOk) {
      this.err(ws, "kicked");
      this.close(ws, 4403, "kicked");
      return;
    }
    let role: Role;
    let playerId: string | null = null;
    let displayId: string | null = null;
    if (hostOk) {
      role = "host";
      playerId = r.hostId;
    } else if (player) {
      role = "player";
      playerId = player.id;
    } else if (display) {
      role = "display";
      displayId = display.id;
    } else {
      if (msg.token) this.err(ws, "unknown_token");
      if (r.phase === "lobby") role = "guest";
      else {
        if (this.countRole("spectator") >= MAX_SPECTATORS) {
          this.err(ws, "room_full");
          this.close(ws, 4429, "room_full");
          return;
        }
        role = "spectator";
      }
    }
    const att: Attachment = { hello: true, role, playerId, displayId, lang: msg.lang, agent };
    ws.serializeAttachment(att);
    if (agent && playerId) {
      const p = r.players.find((x) => x.id === playerId);
      if (p) p.seenAt = Date.now();
    }
    this.send(ws, { type: "welcome", role, code: r.code, playerId });
    if (playerId) {
      this.checkEarlyEnd();
      await this.save();
      await this.schedule();
      this.broadcast(); // connection status changed
    } else {
      this.sendView(ws);
    }
  }

  private async join(ws: WebSocket, att: Attachment, rawName: string): Promise<void> {
    const r = this.room!;
    if (r.phase !== "lobby") return this.err(ws, "game_started");
    if (att.role !== "guest") return this.err(ws, "already_joined");
    const name = cleanName(rawName);
    if (!name) return this.err(ws, "bad_name");
    if (att.agent && r.config.agents === false) return this.err(ws, "agents_off");
    if (r.players.some((p) => !p.kicked && sameName(p.name, name))) return this.err(ws, "name_taken");
    if (seatedPlayers(r).length >= MAX_SEATS) return this.err(ws, "room_full");
    const player = {
      id: newId(),
      name,
      token: newToken(),
      bot: false,
      kicked: false,
      ready: false,
      lastSeq: 0,
      ...(att.agent ? { agent: att.agent, seenAt: Date.now() } : {}),
    };
    r.players.push(player);
    pushEvent(r, "ev_joined", { name });
    this.log("join", { seats: seatedPlayers(r).length });
    att.role = "player";
    att.playerId = player.id;
    ws.serializeAttachment(att);
    this.send(ws, { type: "welcome", role: "player", code: r.code, playerId: player.id, token: player.token! });
    await this.commit();
  }

  private async playerAction(
    ws: WebSocket,
    att: Attachment,
    msg: Extract<ClientMsg, { type: "trade" | "placeSecret" | "usePiece" }>,
  ): Promise<void> {
    const r = this.room!;
    const g = r.game;
    const seat = g && att.playerId && (att.role === "player" || att.role === "host") ? findSeat(g, att.playerId) : undefined;
    if (!g || !seat) return this.err(ws, "not_seated");
    if (r.phase === "paused") return this.err(ws, "paused");
    if (r.phase !== "trading") return this.err(ws, "not_trading");
    const player = r.players.find((p) => p.id === seat.id)!;

    let action: Action;
    if (msg.type === "trade") {
      if (msg.seq <= player.lastSeq) return this.sendPatch(seat.id); // already applied (reconnect resend)
      action = { t: "trade", seat: seat.id, stock: msg.stock, side: msg.side, qty: msg.qty };
    } else if (msg.type === "placeSecret") {
      action = { t: "secret", seat: seat.id, stock: msg.stock };
    } else {
      action = { t: "piece", seat: seat.id, kind: msg.kind, ...(msg.stock !== undefined ? { stock: msg.stock } : {}) };
    }
    const res = this.applyLogged(action);
    if (!res.ok) return this.err(ws, res.code);
    if (msg.type === "trade") player.lastSeq = msg.seq;
    r.lastActivity = Date.now();
    await this.save();

    if (msg.type === "trade") {
      this.toastPlayer(seat.id, "trade_ok", { stock: msg.stock, side: msg.side, qty: msg.qty });
      this.sendPatch(seat.id);
    } else if (msg.type === "placeSecret") {
      this.toastPlayer(seat.id, "secret_placed", { stock: msg.stock });
      this.sendPatch(seat.id);
    } else if (msg.kind === "cash") {
      this.toastPlayer(seat.id, "piece_cash", {});
      this.sendPatch(seat.id);
    } else {
      this.toastPlayer(seat.id, "piece_peek", { stock: msg.stock ?? 0 });
      this.sendViewToPlayer(seat.id); // rule tokens changed
    }
  }

  private async ready(ws: WebSocket, att: Attachment, value: boolean): Promise<void> {
    const r = this.room!;
    const g = r.game;
    const seat = g && att.playerId ? findSeat(g, att.playerId) : undefined;
    if (!seat || (att.role !== "player" && att.role !== "host")) return this.err(ws, "not_seated");
    if (r.phase !== "trading" && r.phase !== "paused") return this.err(ws, "not_trading");
    const player = r.players.find((p) => p.id === seat.id)!;
    player.ready = value;
    this.checkEarlyEnd();
    await this.commit();
  }

  private async kick(ws: WebSocket, playerId: string): Promise<void> {
    const r = this.room!;
    const target = r.players.find((p) => p.id === playerId && !p.kicked);
    if (!target) return this.err(ws, "bad_target");
    if (target.id === r.hostId) return this.err(ws, "cannot_kick_host");
    if (r.phase === "lobby") {
      r.players = r.players.filter((p) => p !== target);
    } else {
      // A kicked player's seat freezes: holdings stay, ranks as normal.
      target.kicked = true;
      target.ready = false;
      if (r.game && findSeat(r.game, target.id)) this.applyLogged({ t: "freeze", seat: target.id });
    }
    pushEvent(r, "ev_left_kicked", { name: target.name });
    for (const s of this.ctx.getWebSockets()) {
      if (this.att(s).playerId === target.id) {
        this.err(s, "kicked");
        this.close(s, 4403, "kicked");
      }
    }
    this.checkEarlyEnd();
    await this.commit();
  }

  private async start(ws: WebSocket): Promise<void> {
    const r = this.room!;
    if (r.phase !== "lobby") return this.err(ws, "lobby_only");
    const seats = seatedPlayers(r);
    if (seats.length < MIN_SEATS) return this.err(ws, "need_players", { min: MIN_SEATS });
    if (seats.length > MAX_SEATS) return this.err(ws, "room_full");
    const init: GameInit = {
      seed: r.config.seed.trim() || randomSeed(),
      ruleSet: r.config.ruleSet,
      seats: seats.map((p) => ({ id: p.id, name: p.name, bot: p.bot ? { skill: r.config.botSkill } : null })),
    };
    r.gameInit = init;
    r.game = createGame(init);
    r.gameNo += 1;
    r.events = [];
    for (const p of r.players) p.ready = false;
    r.phase = "countdown";
    r.countdownEnd = Date.now() + COUNTDOWN_MS;
    r.gameEndsAt = Date.now() + GAME_MAX_MS;
    r.finishedAt = null;
    pushEvent(r, "ev_started", { seats: seats.length });
    this.log("start", { seats: seats.length, ruleSet: init.ruleSet });
    await this.commit();
  }

  /** End the current round: bots act, settle(), advance or finish. */
  private async settle(): Promise<void> {
    const r = this.room!;
    const g = r.game!;
    const before = hiddenMask(g);
    const res = settleRound(g);
    this.logAction({ t: "settle" });
    for (const p of r.players) p.ready = false;
    r.earlyEndAt = null;
    r.pausedRemaining = null;
    pushEvent(r, "ev_settled", { round: res.round }, res.round);
    this.log("settle", { settled: res.round });
    if (g.finished) {
      this.finish();
    } else {
      r.phase = "trading";
      r.deadline = this.roundDeadline(Date.now());
      const group = REVEAL_ROUNDS.indexOf(g.round as (typeof REVEAL_ROUNDS)[number]);
      if (group > 0) pushEvent(r, "ev_reveal", { group, round: g.round });
      const now = hiddenMask(g);
      now.forEach((h, i) => {
        if (h && !before[i]) pushEvent(r, "ev_hidden", { stock: i });
      });
    }
    r.lastActivity = Date.now();
    await this.save();
    await this.schedule();
    const deltas = projectDeltas(g, res.deltas);
    for (const ws of this.ctx.getWebSockets()) {
      if (this.att(ws).hello) this.send(ws, { type: "settled", round: res.round, deltas });
    }
    this.broadcast();
  }

  private finish(): void {
    this.log("finish");
    const r = this.room!;
    r.phase = "finished";
    r.deadline = r.countdownEnd = r.pausedRemaining = r.earlyEndAt = r.gameEndsAt = null;
    r.finishedAt = Date.now();
    pushEvent(r, "ev_finished");
  }

  private async pairTv(pairCode: string): Promise<PairResult> {
    const r = this.room!;
    if (r.displays.length >= MAX_DISPLAYS) return { ok: false, code: "too_many_tvs" };
    const token = newToken();
    let ok = false;
    try {
      ok = await this.env.TV_PAIRING.getByName(pairCode).claim(r.code, token);
    } catch {
      ok = false;
    }
    if (!ok || !this.room) return { ok: false, code: "pair_not_found" };
    this.room.displays.push({ id: newId(), token, createdAt: Date.now() });
    await this.commit();
    return { ok: true };
  }

  private async transferHost(ws: WebSocket, playerId: string): Promise<void> {
    const r = this.room!;
    const target = r.players.find((p) => p.id === playerId && !p.bot && !p.kicked);
    if (!target || target.id === r.hostId) return this.err(ws, "bad_target");
    const oldHost = r.hostId;
    r.hostId = target.id;
    r.hostToken = newToken();
    pushEvent(r, "ev_host_changed", { name: target.name });
    for (const s of this.ctx.getWebSockets()) {
      const a = this.att(s);
      if (!a.hello) continue;
      if (a.role === "host" || a.playerId === oldHost) {
        const seated = r.phase === "lobby" || (r.game ? !!findSeat(r.game, oldHost) : false);
        a.role = seated ? "player" : "spectator";
        a.playerId = seated ? oldHost : null;
        s.serializeAttachment(a);
        this.send(s, { type: "welcome", role: a.role, code: r.code, playerId: a.playerId });
      } else if (a.playerId === target.id) {
        a.role = "host";
        s.serializeAttachment(a);
        this.send(s, { type: "welcome", role: "host", code: r.code, playerId: target.id, hostToken: r.hostToken });
      }
    }
    await this.commit();
  }

  // ------------------------------------------------------------------ helpers

  private applyLogged(action: Action) {
    const res = applyAction(this.room!.game!, action);
    if (res.ok) this.logAction(action);
    return res;
  }

  private logAction(action: Action): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO log (game, at, action) VALUES (?, ?, ?)",
      this.room!.gameNo,
      Date.now(),
      JSON.stringify(action),
    );
  }

  /** "End early when everyone is ready": start or cancel the 3-second settling countdown. */
  private checkEarlyEnd(exclude?: WebSocket): void {
    const r = this.room!;
    // No-limit rounds always end when everyone is ready, whatever the "end early" setting.
    if (r.phase !== "trading" || (!r.config.endEarly && r.config.roundSeconds > 0)) {
      r.earlyEndAt = null;
      return;
    }
    const pool = readyPool(r, this.connectedIds(exclude));
    if (pool.total > 0 && pool.count === pool.total) {
      if (r.earlyEndAt === null) r.earlyEndAt = Date.now() + EARLY_END_MS;
    } else {
      r.earlyEndAt = null;
    }
  }

  private async save(): Promise<void> {
    if (this.room) await this.ctx.storage.put("room", this.room);
  }

  /** Persist, reschedule the alarm and push fresh views to everyone. */
  private async commit(): Promise<void> {
    if (!this.room) return;
    this.room.lastActivity = Date.now();
    await this.save();
    await this.schedule();
    this.broadcast();
  }

  private att(ws: WebSocket): Attachment {
    return (
      (ws.deserializeAttachment() as Attachment | null) ?? {
        hello: false,
        role: "guest",
        playerId: null,
        displayId: null,
        lang: "en",
      }
    );
  }

  private connectedIds(exclude?: WebSocket): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = this.att(ws);
      if (a.hello && a.playerId && (a.role === "player" || a.role === "host")) ids.add(a.playerId);
    }
    // Agents connect once per tool call; a recent call keeps their seat "connected".
    const now = Date.now();
    for (const p of this.room?.players ?? []) {
      if (p.agent && p.seenAt !== undefined && now - p.seenAt < AGENT_PRESENCE_MS) ids.add(p.id);
    }
    return ids;
  }

  private countRole(role: Role): number {
    return this.ctx.getWebSockets().filter((ws) => {
      const a = this.att(ws);
      return a.hello && a.role === role;
    }).length;
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const win = Math.floor(now / 1000);
    const cur = this.rate.get(ws);
    if (!cur || cur.win !== win) {
      this.rate.set(ws, { win, n: 1 });
      return true;
    }
    cur.n += 1;
    return cur.n <= RATE_PER_SEC; // drop anything over the limit
  }

  private viewer(a: Attachment): Viewer {
    return { role: a.role, playerId: a.playerId, lang: a.lang };
  }

  private broadcast(exclude?: WebSocket): void {
    const r = this.room;
    if (!r) return;
    const env = { connected: this.connectedIds(exclude), spectators: this.countRole("spectator"), now: Date.now() };
    const cache = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = this.att(ws);
      if (!a.hello) continue;
      const key = `${a.role}|${a.playerId}|${a.lang}`;
      let payload = cache.get(key);
      if (!payload) {
        payload = JSON.stringify({ type: "view", view: project(r, this.viewer(a), env) } satisfies ServerMsg);
        cache.set(key, payload);
      }
      this.sendRaw(ws, payload);
    }
  }

  private sendView(ws: WebSocket): void {
    const r = this.room;
    if (!r) return;
    const env = { connected: this.connectedIds(), spectators: this.countRole("spectator"), now: Date.now() };
    this.send(ws, { type: "view", view: project(r, this.viewer(this.att(ws)), env) });
  }

  private socketsOf(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      const a = this.att(ws);
      return a.hello && a.playerId === playerId && (a.role === "player" || a.role === "host");
    });
  }

  private sendViewToPlayer(playerId: string): void {
    for (const ws of this.socketsOf(playerId)) this.sendView(ws);
  }

  private sendPatch(playerId: string): void {
    const r = this.room!;
    for (const ws of this.socketsOf(playerId)) {
      const me = projectMeFor(r, this.viewer(this.att(ws)));
      if (me) this.send(ws, { type: "patch", me, serverNow: Date.now() });
    }
  }

  private toastPlayer(playerId: string, code: string, params: Params): void {
    for (const ws of this.socketsOf(playerId)) this.toast(ws, code, params);
  }

  private toast(ws: WebSocket, code: string, params?: Params): void {
    this.send(ws, { type: "toast", code, ...(params ? { params } : {}) });
  }

  private err(ws: WebSocket, code: string, params?: Params): void {
    this.log("error", { code });
    this.send(ws, { type: "error", code, ...(params ? { params } : {}) });
  }

  /**
   * One JSON line per room event (NFR-OBS-1): room code, phase and round only,
   * never tokens or player names, so logs are safe to share.
   */
  private log(ev: string, extra: Record<string, string | number | boolean> = {}): void {
    const r = this.room;
    console.log(
      JSON.stringify({ ev, room: r?.code ?? null, phase: r?.phase ?? null, round: r?.game?.round ?? null, ...extra }),
    );
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      /* socket closing */
    }
  }

  private close(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      /* ignore */
    }
  }
}
