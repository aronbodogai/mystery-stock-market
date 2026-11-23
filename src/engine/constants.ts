export const STOCK_IDS = [
  "open",
  "coyo",
  "latter",
  "defense",
  "airtight",
  "seasoned",
  "alt",
  // Extra companies for boards bigger than the show's (see boards.ts).
  "tidal",
  "halo",
] as const;
export type StockId = (typeof STOCK_IDS)[number];

/** Every company the game knows; a board uses some of them. */
export const NUM_STOCKS = STOCK_IDS.length;
/** The show's seven companies (STOCK_IDS 0..6): the Show and Random boards. */
export const CLASSIC_STOCKS = 7;
export const START_PRICE = 10_000;
export const PRICE_FLOOR = 100;
export const START_CASH = 100_000;
export const START_PIECES = 3;
export const TOTAL_ROUNDS = 24;
export const PIECE_CASH = 10_000;
/** Pieces can be spent until the end of this round. */
export const PIECES_LAST_ROUND = 20;
export const MAX_ORDER = 1_000_000;
export const MAX_SEATS = 16;
export const MIN_SEATS = 2;
export const MAX_SPECTATORS = 8;
export const MAX_DISPLAYS = 4;
/** Group g becomes public at the start of REVEAL_ROUNDS[g]. Group 4 completes every rule. */
export const REVEAL_ROUNDS = [1, 5, 10, 15, 20] as const;
export const MAX_GROUP = 4;
/** A secret placed in round r hides its stock during rounds r+1 .. r+SECRET_LENGTH. */
export const SECRET_LENGTH = 2;
