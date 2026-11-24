import type { Lang } from "../shared/lang";
import type {
  LobbyPlayer,
  MeView,
  Results,
  Role,
  RuleToken,
  Standing,
  StockView,
  View,
} from "../shared/protocol";
import { renderRule } from "../shared/ruleTemplates";
import { MAX_GROUP, MAX_SEATS, MIN_SEATS, TOTAL_ROUNDS } from "./constants";
import { piecesEarned, ranking } from "./game";
import { seatedPlayers, type RoomState } from "./room";
import { companiesFor, lobbyLogo, logoShape } from "./rules";
import {
  anySecretActive,
  companiesOf,
  findSeat,
  holdsHidden,
  isHidden,
  netWorth,
  nextRevealRound,
  revealLevel,
  seatLevel,
} from "./state";
import type { GameState, Seat } from "./types";

export interface Viewer {
  role: Role;
  playerId: string | null;
  lang: Lang;
}

export interface ProjectEnv {
  /** Player ids with at least one open socket. */
  connected: ReadonlySet<string>;
  spectators: number;
  now: number;
}

/** Seat that belongs to the viewer, if the viewer may see private seat data. */
function ownSeat(g: GameState | null, viewer: Viewer): Seat | null {
  if (!g || !viewer.playerId) return null;
  if (viewer.role !== "player" && viewer.role !== "host") return null;
  return findSeat(g, viewer.playerId) ?? null;
}

function projectStocks(g: GameState, seat: Seat | null, lang: Lang): StockView[] {
  const out: StockView[] = [];
  const pubLevel = g.finished ? MAX_GROUP : revealLevel(g.round);
  const points = g.finished ? g.history.length : g.round; // history[0..round-1] are prices during rounds 1..round
  const companies = companiesOf(g);
  for (let i = 0; i < g.prices.length; i++) {
    const hiddenNow = !g.finished && isHidden(g, i);
    // A point k is the price during round k+1. Points from hidden rounds are never drawn.
    const chart: (number | null)[] = [];
    // Once the game is finished everything is revealed.
    for (let k = 0; k < points; k++) chart.push(!g.finished && isHidden(g, i, k + 1) ? null : g.history[k]![i]!);
    const cur = chart[chart.length - 1] ?? null;
    const prev = chart.length >= 2 ? chart[chart.length - 2]! : null;
    const level = seat ? seatLevel(g, seat, i) : pubLevel;
    const rule: RuleToken[] = renderRule(g.rules[i]!, i, lang, companies).map((tok) =>
      tok.g <= level ? { g: tok.g, text: tok.text } : { g: tok.g, len: [...tok.text].length },
    );
    out.push({
      price: hiddenNow ? null : g.prices[i]!,
      delta: hiddenNow || cur === null || prev === null ? null : cur - prev,
      hidden: hiddenNow,
      chart,
      last:
        g.lastStats && !hiddenNow
          ? { buy: g.lastStats.buyVol[i]!, sell: g.lastStats.sellVol[i]!, hold: g.lastStats.holdings[i]! }
          : null,
      lastHidden: hiddenNow && g.lastStats !== null,
      rule,
      level,
    });
  }
  return out;
}

function projectMe(room: RoomState, g: GameState, seat: Seat): MeView {
  const blind = holdsHidden(g, seat);
  const player = room.players.find((p) => p.id === seat.id);
  const net = netWorth(seat, g.prices);
  // Rooms saved before these fields existed have no baseline: show no change.
  const has = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  return {
    seatId: seat.id,
    cash: blind ? null : seat.cash,
    net: blind ? null : net,
    cashDelta: blind || !has(seat.baseCash) ? null : seat.cash - seat.baseCash,
    netDelta: blind || !has(seat.baseNet) ? null : net - seat.baseNet,
    shares: seat.shares.slice(),
    pieces: seat.pieces,
    secretStock: seat.secretStock,
    secretRound: seat.secretRound,
    peeks: seat.peeks.slice(),
    ready: player?.ready ?? false,
    frozen: seat.frozen,
    blind,
  };
}

export function projectMeFor(room: RoomState, viewer: Viewer): MeView | null {
  const seat = ownSeat(room.game, viewer);
  return seat && room.game ? projectMe(room, room.game, seat) : null;
}

/** Humans who count toward "everyone is ready": seated, not frozen, connected. */
export function readyPool(room: RoomState, connected: ReadonlySet<string>): { count: number; total: number } {
  const g = room.game;
  if (!g) return { count: 0, total: 0 };
  let count = 0,
    total = 0;
  for (const seat of g.seats) {
    if (seat.bot || seat.frozen) continue;
    const p = room.players.find((x) => x.id === seat.id);
    if (!p || p.kicked || !connected.has(p.id)) continue;
    total += 1;
    if (p.ready) count += 1;
  }
  return { count, total };
}

function projectResults(room: RoomState, g: GameState, viewer: Viewer): Results {
  const rk = ranking(g);
  return {
    seed: g.seed,
    ruleSet: g.ruleSet,
    companies: companiesOf(g),
    ruleTypes: g.rules.map((r) => r.type),
    rules: g.rules.map((r, i) => renderRule(r, i, room.config.lang, companiesOf(g))), // results use the game language too
    history: g.history.map((h) => h.slice()),
    ranking: rk.map((row) => {
      const seat = findSeat(g, row.seatId)!;
      const earned = piecesEarned(row.net);
      return {
        id: seat.id,
        name: seat.name,
        rank: row.rank,
        net: row.net,
        minNet: row.minNet,
        bot: seat.bot !== null,
        me: seat.id === viewer.playerId,
        pieces: earned.pieces,
        prize: earned.prize,
      };
    }),
  };
}

/**
 * The one place that decides what a viewer may see. The server never sends
 * anything else; the client is not trusted.
 */
export function project(room: RoomState, viewer: Viewer, env: ProjectEnv): View {
  const g = room.game;
  // One language per game: once it starts, everyone (phones and TV) reads the rules in the
  // host's game language, so nobody plays from a different wording. The lobby stays personal.
  const lang = room.phase === "lobby" ? viewer.lang : room.config.lang;
  const isHost = viewer.role === "host";
  const seat = ownSeat(g, viewer);
  const inGame = g !== null && room.phase !== "lobby";
  const seated = new Set(g && inGame ? g.seats.map((s) => s.id) : seatedPlayers(room).map((p) => p.id));
  const me = viewer.playerId ? room.players.find((p) => p.id === viewer.playerId) : undefined;

  const lobby: LobbyPlayer[] = room.players
    .filter((p) => !p.kicked || (inGame && seated.has(p.id)))
    .map((p) => ({
      id: p.id,
      name: p.name,
      bot: p.bot,
      agent: !!p.agent,
      host: p.id === room.hostId,
      connected: p.bot || env.connected.has(p.id),
      seated: seated.has(p.id),
      me: p.id === viewer.playerId,
    }));

  let standings: Standing[] = [];
  if (g && inGame) {
    const hideNet = anySecretActive(g);
    standings = ranking(g).map((row) => {
      const s = findSeat(g, row.seatId)!;
      const p = room.players.find((x) => x.id === s.id);
      return {
        id: s.id,
        name: s.name,
        rank: row.rank,
        net: hideNet ? null : row.net,
        bot: s.bot !== null,
        agent: !!p?.agent,
        ready: p?.ready ?? false,
        connected: s.bot !== null || env.connected.has(s.id),
        frozen: s.frozen,
        me: s.id === viewer.playerId,
      };
    });
  }

  const showSeed = isHost && room.phase === "lobby";
  return {
    code: room.code,
    origin: room.origin,
    phase: room.phase,
    gameNo: room.gameNo,
    serverNow: env.now,
    you: {
      role: viewer.role,
      playerId: viewer.playerId,
      name: me?.name ?? null,
      seated: viewer.playerId ? seated.has(viewer.playerId) : false,
    },
    config: { ...room.config, agents: room.config.agents !== false, seed: showSeed ? room.config.seed : "" },
    lobby,
    seats: { count: inGame && g ? g.seats.length : seatedPlayers(room).length, min: MIN_SEATS, max: MAX_SEATS },
    countdownEnd: room.countdownEnd,
    deadline: room.deadline,
    pausedRemaining: room.pausedRemaining,
    earlyEndAt: room.earlyEndAt,
    round: g && inGame ? g.round : 0,
    totalRounds: TOTAL_ROUNDS,
    revealLevel: g && inGame ? (g.finished ? MAX_GROUP : revealLevel(g.round)) : 0,
    nextReveal: g && inGame && !g.finished ? nextRevealRound(g.round) : null,
    logo: logoShape(g ? g.logo : lobbyLogo(room.config.ruleSet)),
    companies: g ? companiesOf(g) : companiesFor(room.config.ruleSet),
    stocks: g && inGame ? projectStocks(g, seat, lang) : [],
    me: g && inGame && seat ? projectMe(room, g, seat) : null,
    standings,
    ready: inGame ? readyPool(room, env.connected) : { count: 0, total: 0 },
    anySecret: g && inGame ? anySecretActive(g) : false,
    events: room.events.map((e) => ({ ...e })),
    host: isHost
      ? { displays: room.displays.map((d) => ({ id: d.id, createdAt: d.createdAt })), spectators: env.spectators }
      : null,
    results: g && g.finished && room.phase === "finished" ? projectResults(room, g, viewer) : null,
  };
}

/** Per-viewer deltas for the settlement animation: hidden stocks stay hidden. */
export function projectDeltas(g: GameState, deltas: readonly number[]): (number | null)[] {
  return deltas.map((d, i) => (!g.finished && isHidden(g, i) ? null : d));
}
