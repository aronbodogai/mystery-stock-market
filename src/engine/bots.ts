import { doPiece, doSecret, doTrade } from "./actions";
import { NUM_STOCKS, PIECES_LAST_ROUND, START_PIECES, TOTAL_ROUNDS } from "./constants";
import { chance, pick, rand, randInt, shuffle, type RngState } from "./rng";
import { settle } from "./settle";
import { buildCtx, hiddenMask, lastMoves } from "./state";
import type { BotSkill, BotState, BotStyle, GameState, Seat } from "./types";

const STYLES: readonly BotStyle[] = ["momentum", "contrarian", "noise", "holder"];

export function createBot(rng: RngState, skill: BotSkill): BotState {
  const style = pick(rng, STYLES);
  let insightRound: number | null = null;
  if (skill === "normal") insightRound = chance(rng, 0.4) ? randInt(rng, 12, 18) : null;
  if (skill === "hard") insightRound = chance(rng, 0.7) ? randInt(rng, 4, 10) : randInt(rng, 14, 20);
  const secretRound = chance(rng, 0.6) ? randInt(rng, 2, TOTAL_ROUNDS - 1) : null;
  const pieceRounds = new Set<number>();
  while (pieceRounds.size < START_PIECES) pieceRounds.add(randInt(rng, 1, PIECES_LAST_ROUND));
  return { style, skill, insightRound, secretRound, pieceRounds: [...pieceRounds].sort((a, b) => a - b) };
}

function buyWith(state: GameState, seat: Seat, stock: number, frac: number): void {
  const price = state.prices[stock]!;
  const qty = Math.floor((seat.cash * frac) / price);
  if (qty > 0) doTrade(state, seat.id, stock, "buy", qty);
}

function sellPart(state: GameState, seat: Seat, stock: number, frac: number): void {
  const qty = Math.ceil(seat.shares[stock]! * frac);
  if (qty > 0) doTrade(state, seat.id, stock, "sell", qty);
}

/** Predict this round's settlement if `seat` additionally trades `qty` of `stock` (negative = sell). */
function predict(state: GameState, stock = -1, qty = 0): number[] {
  if (stock < 0 || qty === 0) return settle(state.rules, buildCtx(state));
  const buyVol = state.buyVol.slice();
  const sellVol = state.sellVol.slice();
  const holdings = state.holdings.slice();
  if (qty > 0) buyVol[stock]! += qty;
  else sellVol[stock]! += -qty;
  holdings[stock]! += qty;
  return settle(state.rules, buildCtx(state, { buyVol, sellVol, holdings }));
}

function smartTrade(state: GameState, seat: Seat): void {
  const rng = state.rng;
  // Sell predicted losers.
  let pred = predict(state);
  for (let s = 0; s < NUM_STOCKS; s++) {
    if (seat.shares[s]! > 0 && pred[s]! < state.prices[s]!) doTrade(state, seat.id, s, "sell", seat.shares[s]!);
  }
  // Buy the best predicted gainers (two passes), checking that our own order does not flip the outcome.
  for (let pass = 0; pass < 2; pass++) {
    pred = predict(state);
    const order = shuffle(rng, [...Array(NUM_STOCKS).keys()]).sort(
      (a, b) => pred[b]! / state.prices[b]! - pred[a]! / state.prices[a]!,
    );
    for (const s of order) {
      const price = state.prices[s]!;
      if (pred[s]! / price < 1.015) break;
      let qty = Math.floor((seat.cash * (pass === 0 ? 0.85 : 0.95)) / price);
      let done = false;
      for (let tries = 0; tries < 5 && qty > 0; tries++) {
        const p2 = predict(state, s, qty);
        if (p2[s]! / price >= 1.015) {
          doTrade(state, seat.id, s, "buy", qty);
          done = true;
          break;
        }
        qty = Math.floor(qty / 2);
      }
      if (done) break;
    }
  }
}

function styleTrade(state: GameState, seat: Seat): void {
  const rng = state.rng;
  const moves = lastMoves(state);
  const style = seat.bot!.style;
  const stocks = shuffle(rng, [...Array(NUM_STOCKS).keys()]);
  if (!moves && style !== "holder") {
    // Round 1: everyone except holders dips a toe in.
    for (const s of stocks.slice(0, randInt(rng, 1, 2))) buyWith(state, seat, s, 0.2 + rand(rng) * 0.2);
    return;
  }
  switch (style) {
    case "momentum":
    case "contrarian": {
      const want = style === "momentum" ? 1 : -1;
      for (const s of stocks) if (moves![s] === -want && seat.shares[s]! > 0) sellPart(state, seat, s, 1);
      const targets = stocks.filter((s) => moves![s] === want).slice(0, 2);
      for (const s of targets) buyWith(state, seat, s, 0.3 + rand(rng) * 0.2);
      break;
    }
    case "noise": {
      const n = randInt(rng, 1, 3);
      for (let i = 0; i < n; i++) {
        const s = pick(rng, stocks);
        if (chance(rng, 0.5) || seat.shares[s] === 0) buyWith(state, seat, s, 0.1 + rand(rng) * 0.25);
        else sellPart(state, seat, s, 0.3 + rand(rng) * 0.7);
      }
      break;
    }
    case "holder": {
      const held = stocks.filter((s) => seat.shares[s]! > 0);
      if (held.length === 0) {
        for (const s of stocks.slice(0, randInt(rng, 2, 3))) buyWith(state, seat, s, 0.3);
      } else if (chance(rng, 0.15)) {
        sellPart(state, seat, held[0]!, 1);
        const next = stocks.find((s) => seat.shares[s] === 0);
        if (next !== undefined) buyWith(state, seat, next, 0.5);
      }
      break;
    }
  }
}

/** One bot's turn at settlement time, after the humans have traded. */
export function botAct(state: GameState, seat: Seat): void {
  const bot = seat.bot;
  if (!bot || seat.frozen) return;
  const r = state.round;
  const rng = state.rng;
  const insight = bot.insightRound !== null && r >= bot.insightRound;

  // Pieces: cash in on the planned rounds, and spend leftovers before they close.
  if (r <= PIECES_LAST_ROUND) {
    const planned = bot.pieceRounds.filter((x) => x === r).length;
    const uses = r === PIECES_LAST_ROUND ? seat.pieces : planned;
    for (let i = 0; i < uses; i++) doPiece(state, seat.id, "cash");
  }

  // Secret: an insightful bot hides the target of a `secret` rule; others pick at random.
  if (seat.secretStock === null && bot.secretRound !== null && r >= bot.secretRound) {
    const secretRule = state.rules.find((x) => x.type === "secret");
    const mask = hiddenMask(state, r + 1);
    let target = insight && secretRule && secretRule.type === "secret" ? secretRule.a : randInt(rng, 0, NUM_STOCKS - 1);
    if (!insight && mask[target]) target = randInt(rng, 0, NUM_STOCKS - 1);
    doSecret(state, seat.id, target);
  }

  if (insight) smartTrade(state, seat);
  else styleTrade(state, seat);
}
