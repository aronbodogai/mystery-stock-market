import { z } from "zod";
import { MAX_ORDER, NUM_STOCKS } from "../engine/constants";
import { RULE_SETS } from "../engine/types";
import { LANGS } from "./lang";

/**
 * Realtime protocol: JSON over a WebSocket, validated with zod on both ends.
 * Anything that becomes visible text travels as a code plus params, never as
 * a sentence, so every client renders it in its own language.
 */

export const LangZ = z.enum(LANGS);
const StockZ = z.number().int().min(0).max(NUM_STOCKS - 1);
const IdZ = z.string().min(1).max(40);
const TokenZ = z.string().min(1).max(64);

export const RoomConfigZ = z.object({
  ruleSet: z.enum(RULE_SETS),
  // 0 = no limit: the round ends when every player is ready.
  roundSeconds: z.union([z.literal(0), z.literal(60), z.literal(120), z.literal(180), z.literal(300)]),
  endEarly: z.boolean(),
  botSkill: z.enum(["easy", "normal", "hard"]),
  hostPlays: z.boolean(),
  lang: LangZ,
  seed: z.string().max(64),
});

// ---------------------------------------------------------------- client -> server

export const ClientMsgZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), token: TokenZ.optional(), hostToken: TokenZ.optional(), lang: LangZ }),
  z.object({ type: z.literal("join"), name: z.string().max(80) }),
  z.object({ type: z.literal("setLang"), lang: LangZ }),
  z.object({
    type: z.literal("trade"),
    stock: StockZ,
    side: z.enum(["buy", "sell"]),
    qty: z.number().int().min(1).max(MAX_ORDER),
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({ type: z.literal("placeSecret"), stock: StockZ }),
  z.object({ type: z.literal("usePiece"), kind: z.enum(["cash", "peek"]), stock: StockZ.optional() }),
  z.object({ type: z.literal("ready"), value: z.boolean() }),
  z.object({ type: z.literal("ping") }),
  // host only
  z.object({ type: z.literal("setConfig"), config: RoomConfigZ.partial() }),
  z.object({ type: z.literal("addBot") }),
  z.object({ type: z.literal("removeBot"), playerId: IdZ.optional() }),
  z.object({ type: z.literal("kick"), playerId: IdZ }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("endRound") }),
  z.object({ type: z.literal("endGame") }),
  z.object({ type: z.literal("newGame") }),
  z.object({ type: z.literal("pairTv"), pairCode: z.string().regex(/^\d{6}$/) }),
  z.object({ type: z.literal("unpairTv"), displayId: IdZ }),
  z.object({ type: z.literal("transferHost"), playerId: IdZ }),
]);
export type ClientMsg = z.infer<typeof ClientMsgZ>;
export type ClientMsgType = ClientMsg["type"];
export const HOST_ONLY: ReadonlySet<ClientMsgType> = new Set([
  "setConfig", "addBot", "removeBot", "kick", "start", "pause", "resume",
  "endRound", "endGame", "newGame", "pairTv", "unpairTv", "transferHost",
]);

// ---------------------------------------------------------------- server -> client

export const RoleZ = z.enum(["host", "player", "display", "spectator", "guest"]);
export type Role = z.infer<typeof RoleZ>;

export const RuleTokenZ = z.union([
  z.object({ g: z.number().int(), text: z.string() }),
  z.object({ g: z.number().int(), len: z.number().int() }),
]);
export type RuleToken = z.infer<typeof RuleTokenZ>;

export const StockViewZ = z.object({
  price: z.number().nullable(),
  delta: z.number().nullable(),
  hidden: z.boolean(),
  chart: z.array(z.number().nullable()),
  last: z.object({ buy: z.number(), sell: z.number(), hold: z.number() }).nullable(),
  lastHidden: z.boolean(),
  rule: z.array(RuleTokenZ),
  /** Highest group the viewer can read for this rule. */
  level: z.number().int(),
});
export type StockView = z.infer<typeof StockViewZ>;

export const MeViewZ = z.object({
  seatId: z.string(),
  cash: z.number().nullable(),
  net: z.number().nullable(),
  /** Change in cash since the round began (trades, pieces). Null while blind. */
  cashDelta: z.number().nullable(),
  /** Change in net worth since the end of the previous round (the last settlement). Null while blind. */
  netDelta: z.number().nullable(),
  shares: z.array(z.number()),
  pieces: z.number(),
  secretStock: z.number().nullable(),
  secretRound: z.number().nullable(),
  peeks: z.array(z.number()),
  ready: z.boolean(),
  frozen: z.boolean(),
  /** Holding a hidden stock: own cash and net worth are hidden. */
  blind: z.boolean(),
});
export type MeView = z.infer<typeof MeViewZ>;

export const StandingZ = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.number(),
  net: z.number().nullable(),
  bot: z.boolean(),
  ready: z.boolean(),
  connected: z.boolean(),
  frozen: z.boolean(),
  me: z.boolean(),
});
export type Standing = z.infer<typeof StandingZ>;

export const LobbyPlayerZ = z.object({
  id: z.string(),
  name: z.string(),
  bot: z.boolean(),
  host: z.boolean(),
  connected: z.boolean(),
  seated: z.boolean(),
  me: z.boolean(),
});
export type LobbyPlayer = z.infer<typeof LobbyPlayerZ>;

export const FeedEventZ = z.object({
  id: z.number(),
  round: z.number().nullable(),
  code: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type FeedEventView = z.infer<typeof FeedEventZ>;

export const ResultRowZ = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.number(),
  net: z.number(),
  minNet: z.number(),
  bot: z.boolean(),
  me: z.boolean(),
  pieces: z.number(),
  prize: z.boolean(),
});
export type ResultRow = z.infer<typeof ResultRowZ>;

export const ResultsZ = z.object({
  seed: z.string(),
  ruleSet: z.enum(RULE_SETS),
  /** companies[slot] = index into STOCK_IDS. */
  companies: z.array(z.number()),
  ruleTypes: z.array(z.string()),
  rules: z.array(z.array(z.object({ g: z.number(), text: z.string() }))),
  history: z.array(z.array(z.number())),
  ranking: z.array(ResultRowZ),
});
export type Results = z.infer<typeof ResultsZ>;

export const ViewZ = z.object({
  code: z.string(),
  origin: z.string(),
  phase: z.enum(["lobby", "countdown", "trading", "paused", "finished"]),
  gameNo: z.number(),
  serverNow: z.number(),
  you: z.object({ role: RoleZ, playerId: z.string().nullable(), name: z.string().nullable(), seated: z.boolean() }),
  config: RoomConfigZ,
  lobby: z.array(LobbyPlayerZ),
  seats: z.object({ count: z.number(), min: z.number(), max: z.number() }),
  countdownEnd: z.number().nullable(),
  deadline: z.number().nullable(),
  pausedRemaining: z.number().nullable(),
  earlyEndAt: z.number().nullable(),
  round: z.number(),
  totalRounds: z.number(),
  revealLevel: z.number(),
  nextReveal: z.number().nullable(),
  /** Normalized logo shape (0..1). The logo rule hides in plain sight. */
  logo: z.array(z.number()),
  /** Companies on the board, by slot (index into STOCK_IDS); every per-stock array is indexed by slot. */
  companies: z.array(z.number()),
  stocks: z.array(StockViewZ),
  me: MeViewZ.nullable(),
  standings: z.array(StandingZ),
  ready: z.object({ count: z.number(), total: z.number() }),
  anySecret: z.boolean(),
  events: z.array(FeedEventZ),
  host: z
    .object({
      displays: z.array(z.object({ id: z.string(), createdAt: z.number() })),
      spectators: z.number(),
    })
    .nullable(),
  results: ResultsZ.nullable(),
});
export type View = z.infer<typeof ViewZ>;

export const ServerMsgZ = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    role: RoleZ,
    code: z.string(),
    playerId: z.string().nullable(),
    token: z.string().optional(),
    hostToken: z.string().optional(),
  }),
  z.object({ type: z.literal("view"), view: ViewZ }),
  z.object({ type: z.literal("patch"), me: MeViewZ, serverNow: z.number() }),
  z.object({ type: z.literal("settled"), round: z.number(), deltas: z.array(z.number().nullable()) }),
  z.object({ type: z.literal("error"), code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])).optional() }),
  z.object({ type: z.literal("toast"), code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])).optional() }),
  z.object({ type: z.literal("pong"), serverNow: z.number() }),
]);
export type ServerMsg = z.infer<typeof ServerMsgZ>;

// ---------------------------------------------------------------- TV pairing socket

export const TvMsgZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("waiting"), pairCode: z.string(), expiresAt: z.number() }),
  z.object({ type: z.literal("paired"), roomCode: z.string(), displayToken: z.string() }),
  z.object({ type: z.literal("expired") }),
]);
export type TvMsg = z.infer<typeof TvMsgZ>;

// ---------------------------------------------------------------- HTTP

export const CreateRoomReqZ = z.object({ name: z.string().max(80), lang: LangZ });
export const CreateRoomResZ = z.object({
  code: z.string(),
  hostToken: z.string(),
  playerId: z.string(),
  playerToken: z.string(),
});
export type CreateRoomRes = z.infer<typeof CreateRoomResZ>;

export const CreateTvResZ = z.object({ pairCode: z.string(), expiresAt: z.number(), origin: z.string() });
export type CreateTvRes = z.infer<typeof CreateTvResZ>;

export const PairReqZ = z.object({ hostToken: TokenZ, pairCode: z.string().regex(/^\d{6}$/) });
