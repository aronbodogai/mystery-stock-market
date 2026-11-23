import { doFreeze, doPiece, doSecret, doTrade } from "./actions";
import { botAct, createBot } from "./bots";
import { START_CASH, START_PIECES, START_PRICE, TOTAL_ROUNDS } from "./constants";
import { seedRng } from "./rng";
import { makeRules } from "./rules";
import { settle } from "./settle";
import { buildCtx, netWorth, zeros } from "./state";
import type { Action, ActionResult, GameState, RuleSet, SeatInit, SettleResult } from "./types";

export interface GameInit {
  seed: string;
  ruleSet: RuleSet;
  seats: SeatInit[];
}

export function createGame(init: GameInit): GameState {
  const rng = seedRng(init.seed);
  const { rules, logo, companies } = makeRules(init.ruleSet, rng);
  const n = companies.length;
  const opening = new Array(n).fill(START_PRICE);
  const seats = init.seats.map((s) => ({
    id: s.id,
    name: s.name,
    bot: s.bot ? createBot(rng, s.bot.skill) : null,
    cash: START_CASH,
    shares: zeros(n),
    pieces: START_PIECES,
    secretStock: null,
    secretRound: null,
    peeks: zeros(n),
    minNet: START_CASH,
    baseCash: START_CASH,
    baseNet: START_CASH,
    frozen: false,
  }));
  return {
    v: 1,
    seed: init.seed,
    ruleSet: init.ruleSet,
    companies,
    rng,
    rules,
    logo,
    round: 1,
    finished: false,
    prices: opening.slice(),
    history: [opening.slice()],
    buyVol: zeros(n),
    sellVol: zeros(n),
    holdings: zeros(n),
    prevHoldings: zeros(n),
    lastStats: null,
    secrets: [],
    seats,
  };
}

/**
 * End the current round: bots act (after the humans), pending secrets take
 * effect, settle() runs, and the round advances. After round 24 the game is
 * finished.
 */
export function settleRound(state: GameState): SettleResult {
  if (state.finished) throw new Error("game already finished");
  for (const seat of state.seats) if (seat.bot) botAct(state, seat);

  const r = state.round;
  const before = state.prices.slice();
  // Baselines for the next round's "change" display: end of this round, at this round's prices.
  for (const seat of state.seats) {
    seat.baseCash = seat.cash;
    seat.baseNet = netWorth(seat, before);
  }
  const after = settle(state.rules, buildCtx(state));
  const deltas = after.map((p, i) => p - before[i]!);

  state.lastStats = {
    buyVol: state.buyVol.slice(),
    sellVol: state.sellVol.slice(),
    holdings: state.holdings.slice(),
  };
  state.prevHoldings = state.holdings.slice();
  state.buyVol = zeros(after.length);
  state.sellVol = zeros(after.length);
  state.prices = after.slice();
  state.history.push(after.slice());
  for (const seat of state.seats) seat.minNet = Math.min(seat.minNet, netWorth(seat, after));

  if (r >= TOTAL_ROUNDS) state.finished = true;
  else state.round = r + 1;
  return { round: r, before, after, deltas };
}

export function applyAction(state: GameState, a: Action): ActionResult {
  switch (a.t) {
    case "trade":
      return doTrade(state, a.seat, a.stock, a.side, a.qty);
    case "secret":
      return doSecret(state, a.seat, a.stock);
    case "piece":
      return doPiece(state, a.seat, a.kind, a.stock);
    case "freeze":
      return doFreeze(state, a.seat);
    case "settle":
      if (state.finished) return { ok: false, code: "game_over" };
      settleRound(state);
      return { ok: true };
    case "end":
      if (state.finished) return { ok: false, code: "game_over" };
      state.finished = true;
      return { ok: true };
  }
}

/** Rebuild a game from its init and the ordered list of accepted actions. */
export function replay(init: GameInit, actions: readonly Action[]): GameState {
  const state = createGame(init);
  for (const a of actions) applyAction(state, a);
  return state;
}

export interface RankEntry {
  seatId: string;
  net: number;
  minNet: number;
  rank: number;
}

/** Rank by net worth; ties broken by the higher lowest-ever net worth. */
export function ranking(state: GameState): RankEntry[] {
  const rows = state.seats.map((s, idx) => ({ seatId: s.id, net: netWorth(s, state.prices), minNet: s.minNet, idx }));
  rows.sort((a, b) => b.net - a.net || b.minNet - a.minNet || a.idx - b.idx);
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.net !== r.net || prev.minNet !== r.minNet) rank = i + 1;
    return { seatId: r.seatId, net: r.net, minNet: r.minNet, rank };
  });
}

/** Pieces earned at the end: 1 for 1.5M, 2 for 3M, 3 for 6M, plus a prize token at 10M. */
export function piecesEarned(net: number): { pieces: number; prize: boolean } {
  const pieces = net >= 6_000_000 ? 3 : net >= 3_000_000 ? 2 : net >= 1_500_000 ? 1 : 0;
  return { pieces, prize: net >= 10_000_000 };
}
