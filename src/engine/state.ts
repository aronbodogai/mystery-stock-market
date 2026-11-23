import { CLASSIC_STOCKS, MAX_GROUP, REVEAL_ROUNDS, SECRET_LENGTH } from "./constants";
import type { GameState, Seat, SettleCtx } from "./types";

export const zeros = (n: number = CLASSIC_STOCKS): number[] => new Array(n).fill(0);

/** Number of companies on this game's board. */
export const boardSize = (state: GameState): number => state.prices.length;

const ALL_COMPANIES = Array.from({ length: CLASSIC_STOCKS }, (_, i) => i);

/** companies[slot] = index into STOCK_IDS (older saved games: the show's 7 in order). */
export function companiesOf(state: GameState): number[] {
  return state.companies ? state.companies.slice() : ALL_COMPANIES.slice();
}

/** Highest rule group that is public during `round`. */
export function revealLevel(round: number): number {
  let g = 0;
  for (let i = 0; i < REVEAL_ROUNDS.length; i++) if (round >= REVEAL_ROUNDS[i]!) g = i;
  return Math.min(g, MAX_GROUP);
}

/** Round in which the next group is revealed, or null when every rule is complete. */
export function nextRevealRound(round: number): number | null {
  for (const r of REVEAL_ROUNDS) if (r > round) return r;
  return null;
}

/** Highest group of stock `stock`'s rule this seat can read (public level or own peek). */
export function seatLevel(state: GameState, seat: Seat | null, stock: number): number {
  const pub = state.finished ? MAX_GROUP : revealLevel(state.round);
  if (!seat) return pub;
  return Math.max(pub, seat.peeks[stock] ?? 0);
}

/** Is `stock` hidden by a secret during `round`? */
export function isHidden(state: GameState, stock: number, round: number = state.round): boolean {
  return state.secrets.some((s) => s.stock === stock && round > s.round && round <= s.round + SECRET_LENGTH);
}

export function hiddenMask(state: GameState, round: number = state.round): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < boardSize(state); i++) out.push(isHidden(state, i, round));
  return out;
}

/** Any secret active (any stock hidden) in the current round. Standings hide net worth then. */
export function anySecretActive(state: GameState): boolean {
  if (state.finished) return false;
  return hiddenMask(state).some(Boolean);
}

export function netWorth(seat: Seat, prices: readonly number[]): number {
  let v = seat.cash;
  for (let i = 0; i < seat.shares.length; i++) v += seat.shares[i]! * prices[i]!;
  return v;
}

/** Holds any share of a stock that is hidden this round: own cash and net worth are hidden. */
export function holdsHidden(state: GameState, seat: Seat): boolean {
  if (state.finished) return false;
  const mask = hiddenMask(state);
  return seat.shares.some((q, i) => q > 0 && mask[i]);
}

export function findSeat(state: GameState, id: string): Seat | undefined {
  return state.seats.find((s) => s.id === id);
}

/** Direction of each stock's move in the settlement that produced the current prices. */
export function lastMoves(state: GameState): number[] | null {
  const k = state.history.length - 1; // index of current prices
  if (k < 1) return null;
  const now = state.history[k]!;
  const before = state.history[k - 1]!;
  return now.map((p, i) => Math.sign(p - before[i]!));
}

/** Build the settle() context for the current round from live state. */
export function buildCtx(
  state: GameState,
  over?: { buyVol?: number[]; sellVol?: number[]; holdings?: number[]; hiddenNext?: boolean[] },
): SettleCtx {
  return {
    round: state.round,
    prices: state.prices.slice(),
    prevMoves: lastMoves(state),
    buyVol: (over?.buyVol ?? state.buyVol).slice(),
    sellVol: (over?.sellVol ?? state.sellVol).slice(),
    holdings: (over?.holdings ?? state.holdings).slice(),
    prevHoldings: state.prevHoldings.slice(),
    hiddenNext: over?.hiddenNext ?? hiddenMask(state, state.round + 1),
    logo: state.logo,
  };
}
