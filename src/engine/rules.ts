import { CLASSIC_STOCKS, START_PRICE, TOTAL_ROUNDS } from "./constants";
import { BOARDS, dealBoard, isBoard } from "./boards";
import { pick, randInt, randStep, shuffle, type RngState } from "./rng";
import { RULE_TYPES, type Rule, type RuleSet, type RuleType } from "./types";

/**
 * The show-rules logo path: an "M" for Mystery. logo[r] is Alt
 * Entertainment's price after round r. The same shape is drawn as the game
 * logo on every screen, so the rule hides in plain sight.
 * // Our own addition: the broadcast's logo shape is not reproduced.
 */
export const SHOW_LOGO: readonly number[] = [
  10000, 11800, 13600, 15400, 17200, 19000, 20800, 19300, 17800, 16300, 14800, 13300, 11800,
  13300, 14800, 16300, 17800, 19300, 20800, 18800, 16800, 14800, 12800, 10800, 8800,
];

/** Random logo path: a few control points joined by straight lines. */
export function randomLogo(rng: RngState): number[] {
  const knots = [0];
  let r = 0;
  while (r < TOTAL_ROUNDS) {
    r = Math.min(TOTAL_ROUNDS, r + randInt(rng, 3, 6));
    knots.push(r);
  }
  const values = knots.map((k) => (k === 0 ? START_PRICE : randStep(rng, 3000, 26000, 100)));
  const path: number[] = [];
  for (let seg = 0; seg < knots.length - 1; seg++) {
    const k0 = knots[seg]!,
      k1 = knots[seg + 1]!;
    const v0 = values[seg]!,
      v1 = values[seg + 1]!;
    for (let x = k0; x < k1; x++) {
      path.push(Math.round((v0 + ((v1 - v0) * (x - k0)) / (k1 - k0)) / 100) * 100);
    }
  }
  path.push(values[values.length - 1]!);
  path[0] = START_PRICE;
  return path;
}

function otherStock(rng: RngState, self: number, exclude: number[] = []): number {
  const options: number[] = [];
  for (let i = 0; i < CLASSIC_STOCKS; i++) if (i !== self && !exclude.includes(i)) options.push(i);
  return pick(rng, options);
}

function randomRule(rng: RngState, type: RuleType, self: number): Rule {
  switch (type) {
    case "cmpBuy":
      return { type, a: otherStock(rng, self), x: randStep(rng, 800, 2000, 100), y: randStep(rng, 400, 1200, 100) };
    case "band": {
      const l = randInt(rng, 5, 20);
      return { type, l, h: l + randInt(rng, 10, 30), x: randStep(rng, 1000, 2000, 100), y: randStep(rng, 600, 1400, 100) };
    }
    case "perShare":
      return { type, p: randStep(rng, 100, 300, 50) };
    case "follow":
      return { type, a: otherStock(rng, self), x: randInt(rng, 5, 15), y: randInt(rng, 5, 15) };
    case "breadth":
      return { type, k: 4, x: randInt(rng, 10, 25), y: randInt(rng, 5, 15) };
    case "secret":
      return { type, a: otherStock(rng, self), x: randInt(rng, 8, 18), y: randStep(rng, 500, 1500, 100) };
    case "logo":
      return { type };
    case "sellBuy":
      return { type, x: randStep(rng, 800, 2000, 100), y: randStep(rng, 400, 1200, 100) };
    case "cheapest":
      return { type, x: randInt(rng, 5, 20), y: randStep(rng, 300, 1000, 100) };
    case "holdRank":
      return { type, x: randInt(rng, 5, 15), y: randStep(rng, 300, 1000, 100) };
  }
}

/** Randomized rule set: 7 of the 10 types, given to random companies (always the show's 7 companies). */
export function randomRules(rng: RngState): Rule[] {
  const types = shuffle(rng, RULE_TYPES).slice(0, CLASSIC_STOCKS);
  return types.map((type, i) => randomRule(rng, type, i));
}

/** The show's seven companies, in STOCK_IDS order (Show and Random boards). */
export const CLASSIC_COMPANIES: readonly number[] = Array.from({ length: CLASSIC_STOCKS }, (_, i) => i);

/** Companies on the board for a rule set (known before the game starts). */
export function companiesFor(ruleSet: RuleSet): number[] {
  return isBoard(ruleSet) ? BOARDS[ruleSet].companies.slice() : CLASSIC_COMPANIES.slice();
}

/** Logo path shown before a game starts (only fixed sets have one). */
export function lobbyLogo(ruleSet: RuleSet): readonly number[] {
  return ruleSet === "random" ? [] : SHOW_LOGO;
}

export function makeRules(ruleSet: RuleSet, rng: RngState): { rules: Rule[]; logo: number[]; companies: number[] } {
  if (isBoard(ruleSet)) {
    const board = BOARDS[ruleSet];
    // A board may deal its rules to its companies in a new order every game (see dealBoard).
    const dealt = board.shuffle ? dealBoard(board, rng) : board;
    return { rules: dealt.rules.map((r) => ({ ...r })), logo: SHOW_LOGO.slice(), companies: dealt.companies.slice() };
  }
  const rules = randomRules(rng);
  const logo = randomLogo(rng);
  return { rules, logo, companies: companiesFor(ruleSet) };
}

/** Normalized logo shape (0..1, 2 decimals) for drawing. Carries no absolute values. */
export function logoShape(logo: readonly number[]): number[] {
  if (logo.length === 0) return [];
  const min = Math.min(...logo);
  const max = Math.max(...logo);
  const span = max - min || 1;
  return logo.map((v) => Math.round(((v - min) / span) * 100) / 100);
}
