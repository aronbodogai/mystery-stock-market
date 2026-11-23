import type { RngState } from "./rng";

export type RuleType =
  | "cmpBuy"
  | "band"
  | "perShare"
  | "follow"
  | "breadth"
  | "secret"
  | "logo"
  | "sellBuy"
  | "cheapest"
  | "holdRank";

export const RULE_TYPES: readonly RuleType[] = [
  "cmpBuy",
  "band",
  "perShare",
  "follow",
  "breadth",
  "secret",
  "logo",
  "sellBuy",
  "cheapest",
  "holdRank",
];

/**
 * Rule parameters. Amount units:
 * - money (whole marks): x/y on cmpBuy, band, sellBuy; p on perShare; y on secret, cheapest, holdRank
 * - percent (whole %): x/y on follow, breadth; x on secret, cheapest, holdRank
 * `a` is the index of another stock.
 */
export type Rule =
  | { type: "cmpBuy"; a: number; x: number; y: number }
  | { type: "band"; l: number; h: number; x: number; y: number }
  | { type: "perShare"; p: number }
  | { type: "follow"; a: number; x: number; y: number }
  | { type: "breadth"; k: number; x: number; y: number }
  | { type: "secret"; a: number; x: number; y: number }
  | { type: "logo" }
  | { type: "sellBuy"; x: number; y: number }
  | { type: "cheapest"; x: number; y: number }
  | { type: "holdRank"; x: number; y: number };

export interface SettleCtx {
  /** Round being settled, 1-based. */
  round: number;
  /** Prices during this round, before settlement. */
  prices: number[];
  /** Direction of each stock's move in the previous settlement (-1, 0, 1); null in round 1. */
  prevMoves: number[] | null;
  buyVol: number[];
  sellVol: number[];
  /** Total holdings (all seats) at the end of this round. */
  holdings: number[];
  /** Total holdings at the end of the previous round. */
  prevHoldings: number[];
  /** Whether each stock will be hidden during round + 1. */
  hiddenNext: boolean[];
  /** logo[r] = the logo stock's price after round r. */
  logo: number[];
}

export type BotStyle = "momentum" | "contrarian" | "noise" | "holder";
export type BotSkill = "easy" | "normal" | "hard";

export interface BotState {
  style: BotStyle;
  skill: BotSkill;
  /** Round from which the bot trades on settle() predictions; null = never. */
  insightRound: number | null;
  /** Round in which the bot places its secret; null = never. */
  secretRound: number | null;
  /** Rounds in which the bot cashes in a piece. */
  pieceRounds: number[];
}

export interface Seat {
  id: string;
  name: string;
  bot: BotState | null;
  cash: number;
  shares: number[];
  pieces: number;
  secretStock: number | null;
  secretRound: number | null;
  /** peeks[s] = highest rule group this seat has peeked for stock s (0 = nothing beyond public). */
  peeks: number[];
  /** Lowest net worth seen at the start or after any settlement (tie-break). */
  minNet: number;
  /** Cash when the current round began (for the "change since last round" display). */
  baseCash: number;
  /** Net worth at the end of the previous round, at that round's prices. */
  baseNet: number;
  /** Kicked mid-game: holdings stay, no more actions. */
  frozen: boolean;
}

export interface SecretRecord {
  seat: string;
  stock: number;
  round: number;
}

export interface RoundStats {
  buyVol: number[];
  sellVol: number[];
  holdings: number[];
}

export type RuleSet = "show" | "random";

export interface GameState {
  v: 1;
  seed: string;
  ruleSet: RuleSet;
  rng: RngState;
  rules: Rule[];
  /** Logo path: logo[r] = logo stock price after round r (logo[0] = opening price). */
  logo: number[];
  /** Current round (1..24). Stays at 24 once finished. */
  round: number;
  finished: boolean;
  /** Prices during the current round. */
  prices: number[];
  /** history[k] = prices after round k settled; history[0] = opening prices. */
  history: number[][];
  buyVol: number[];
  sellVol: number[];
  holdings: number[];
  prevHoldings: number[];
  /** Stats of the last settled round (published at settlement). */
  lastStats: RoundStats | null;
  secrets: SecretRecord[];
  seats: Seat[];
}

export interface SeatInit {
  id: string;
  name: string;
  bot?: { skill: BotSkill } | null;
}

export type Side = "buy" | "sell";
export type PieceKind = "cash" | "peek";

/** Engine actions. Together with the seed, the ordered list replays a game exactly. */
export type Action =
  | { t: "trade"; seat: string; stock: number; side: Side; qty: number }
  | { t: "secret"; seat: string; stock: number }
  | { t: "piece"; seat: string; kind: PieceKind; stock?: number }
  | { t: "freeze"; seat: string }
  | { t: "settle" }
  /** Host ended the game early: rank on current prices. */
  | { t: "end" };

export type ActionError =
  | "game_over"
  | "no_seat"
  | "frozen"
  | "bad_stock"
  | "bad_qty"
  | "insufficient_cash"
  | "not_enough_shares"
  | "secret_used"
  | "pieces_closed"
  | "no_pieces"
  | "rule_fully_visible";

export type ActionResult = { ok: true } | { ok: false; code: ActionError };

export interface SettleResult {
  round: number;
  before: number[];
  after: number[];
  deltas: number[];
}
