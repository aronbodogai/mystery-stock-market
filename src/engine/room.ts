import type { Lang } from "../shared/lang";
import type { GameInit } from "./game";
import type { BotSkill, GameState, RuleSet } from "./types";

export type Phase = "lobby" | "countdown" | "trading" | "paused" | "finished";
/** Seconds per round; 0 = no limit (the round ends when every player is ready, or the host ends it). */
export type RoundSeconds = 0 | 60 | 120 | 180 | 300;
export const ROUND_SECONDS: readonly RoundSeconds[] = [60, 120, 180, 300, 0];
/** Hard cap on one game's length. When it is reached the game ends and the room is cleaned up an hour later. */
export const GAME_MAX_MS = 4 * 60 * 60 * 1000;

export interface RoomConfig {
  ruleSet: RuleSet;
  roundSeconds: RoundSeconds;
  endEarly: boolean;
  botSkill: BotSkill;
  hostPlays: boolean;
  lang: Lang;
  /** Optional; empty = random at start. Only the host sees it before the game ends. */
  seed: string;
  /** AI agents may take seats over MCP (NFR-MCP-7). Rooms saved before agents existed lack it: allowed. */
  agents: boolean;
}

export interface RoomPlayer {
  id: string;
  name: string;
  /** Secret player token (128-bit hex). Bots have none. */
  token: string | null;
  bot: boolean;
  /** Kicked: removed in the lobby, frozen in a game. */
  kicked: boolean;
  ready: boolean;
  /** Highest trade seq applied for this seat (idempotency across reconnects). */
  lastSeq: number;
  /** Seat taken by an AI agent over MCP: a hash of the logged-in account that owns it (NFR-MCP-7/8). */
  agent?: string;
  /** Agents connect once per tool call, so they count as connected for a while after their last call. */
  seenAt?: number;
}

export interface RoomDisplay {
  id: string;
  token: string;
  createdAt: number;
}

export type EventCode =
  | "ev_joined"
  | "ev_left_kicked"
  | "ev_bot_added"
  | "ev_started"
  | "ev_settled"
  | "ev_reveal"
  | "ev_hidden"
  | "ev_paused"
  | "ev_resumed"
  | "ev_host_changed"
  | "ev_time_limit"
  | "ev_finished";

export interface FeedEvent {
  id: number;
  round: number | null;
  code: EventCode;
  params: Record<string, string | number>;
}

export interface RoomState {
  v: 1;
  code: string;
  /** Absolute origin used to build QR / join URLs. */
  origin: string;
  createdAt: number;
  hostToken: string;
  /** Player record of the host (seated only when config.hostPlays). */
  hostId: string;
  config: RoomConfig;
  players: RoomPlayer[];
  displays: RoomDisplay[];
  phase: Phase;
  countdownEnd: number | null;
  deadline: number | null;
  pausedRemaining: number | null;
  /** "Everyone is ready" countdown end. */
  earlyEndAt: number | null;
  /** The game ends automatically at this time (start + GAME_MAX_MS). Missing in rooms saved before the cap existed. */
  gameEndsAt?: number | null;
  game: GameState | null;
  gameInit: GameInit | null;
  gameNo: number;
  events: FeedEvent[];
  eventSeq: number;
  lastActivity: number;
  finishedAt: number | null;
}

export const DEFAULT_CONFIG: RoomConfig = {
  ruleSet: "show",
  roundSeconds: 120,
  endEarly: true,
  botSkill: "normal",
  hostPlays: true,
  lang: "en",
  seed: "",
  agents: true,
};

/** Players who get a seat when the game starts. */
export function seatedPlayers(room: RoomState): RoomPlayer[] {
  return room.players.filter((p) => !p.kicked && (p.id !== room.hostId || room.config.hostPlays));
}

export function humanCount(room: RoomState): number {
  return room.players.filter((p) => !p.kicked && !p.bot).length;
}

export function pushEvent(
  room: RoomState,
  code: EventCode,
  params: Record<string, string | number> = {},
  round?: number,
): void {
  room.eventSeq += 1;
  const r = round ?? (room.game && !room.game.finished && room.phase !== "lobby" ? room.game.round : null);
  room.events.push({ id: room.eventSeq, round: r, code, params });
  if (room.events.length > 40) room.events.splice(0, room.events.length - 40);
}
