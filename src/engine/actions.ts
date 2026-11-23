import { MAX_GROUP, MAX_ORDER, PIECES_LAST_ROUND, PIECE_CASH } from "./constants";
import { findSeat, revealLevel } from "./state";
import type { ActionResult, GameState, PieceKind, Side } from "./types";

const fail = (code: Extract<ActionResult, { ok: false }>["code"]): ActionResult => ({ ok: false, code });
const OK: ActionResult = { ok: true };

function validStock(state: GameState, stock: number): boolean {
  return Number.isInteger(stock) && stock >= 0 && stock < state.prices.length;
}

export function doTrade(state: GameState, seatId: string, stock: number, side: Side, qty: number): ActionResult {
  if (state.finished) return fail("game_over");
  const seat = findSeat(state, seatId);
  if (!seat) return fail("no_seat");
  if (seat.frozen) return fail("frozen");
  if (!validStock(state, stock)) return fail("bad_stock");
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ORDER) return fail("bad_qty");
  const price = state.prices[stock]!;
  if (side === "buy") {
    const cost = price * qty;
    if (cost > seat.cash) return fail("insufficient_cash");
    seat.cash -= cost;
    seat.shares[stock]! += qty;
    state.holdings[stock]! += qty;
    state.buyVol[stock]! += qty;
  } else {
    if (qty > seat.shares[stock]!) return fail("not_enough_shares");
    seat.cash += price * qty;
    seat.shares[stock]! -= qty;
    state.holdings[stock]! -= qty;
    state.sellVol[stock]! += qty;
  }
  return OK;
}

export function doSecret(state: GameState, seatId: string, stock: number): ActionResult {
  if (state.finished) return fail("game_over");
  const seat = findSeat(state, seatId);
  if (!seat) return fail("no_seat");
  if (seat.frozen) return fail("frozen");
  if (!validStock(state, stock)) return fail("bad_stock");
  if (seat.secretStock !== null) return fail("secret_used");
  seat.secretStock = stock;
  seat.secretRound = state.round;
  state.secrets.push({ seat: seat.id, stock, round: state.round });
  return OK;
}

export function doPiece(state: GameState, seatId: string, kind: PieceKind, stock?: number): ActionResult {
  if (state.finished) return fail("game_over");
  const seat = findSeat(state, seatId);
  if (!seat) return fail("no_seat");
  if (seat.frozen) return fail("frozen");
  if (state.round > PIECES_LAST_ROUND) return fail("pieces_closed");
  if (seat.pieces <= 0) return fail("no_pieces");
  if (kind === "cash") {
    seat.pieces -= 1;
    seat.cash += PIECE_CASH;
    return OK;
  }
  if (stock === undefined || !validStock(state, stock)) return fail("bad_stock");
  const level = Math.max(revealLevel(state.round), seat.peeks[stock]!);
  if (level >= MAX_GROUP) return fail("rule_fully_visible"); // piece is kept
  seat.peeks[stock] = level + 1;
  seat.pieces -= 1;
  return OK;
}

export function doFreeze(state: GameState, seatId: string): ActionResult {
  const seat = findSeat(state, seatId);
  if (!seat) return fail("no_seat");
  seat.frozen = true;
  return OK;
}
