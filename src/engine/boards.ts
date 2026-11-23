import { NUM_STOCKS } from "./constants";
import { shuffle, type RngState } from "./rng";
import type { BoardId, Rule, RuleSet } from "./types";

/**
 * Hand-made boards: which companies are on the board and what rule each one
 * follows. To add a board: give it an id in BOARD_IDS (types.ts), a name in the
 * catalogs (set.rule<Id>) and an entry below. `defineBoard` checks it when the
 * module loads, so a broken board fails every test instead of a live game.
 *
 * Indexing: rules[slot] belongs to companies[slot]; a rule's `a` names another
 * SLOT on this board (not a company), so rules can be dealt to other companies
 * without rewriting them by hand (see dealBoard).
 */
export interface Board {
  /** companies[slot] = index into STOCK_IDS. */
  companies: number[];
  rules: Rule[];
  /** Deal the rules to the companies in a new seeded order every game. */
  shuffle?: boolean;
}

// Company indices, in STOCK_IDS order.
const OPEN = 0,
  COYO = 1,
  LATTER = 2,
  DEFENSE = 3,
  AIRTIGHT = 4,
  SEASONED = 5,
  ALT = 6,
  TIDAL = 7,
  HALO = 8;

/** Problems that would make a board play differently from what its rules say. */
export function boardProblems(board: Board): string[] {
  const out: string[] = [];
  const n = board.companies.length;
  if (n < 2) out.push("needs at least 2 companies");
  if (board.rules.length !== n) out.push(`has ${n} companies but ${board.rules.length} rules`);
  if (new Set(board.companies).size !== n) out.push("lists a company twice");
  for (const c of board.companies) {
    if (!Number.isInteger(c) || c < 0 || c >= NUM_STOCKS) out.push(`unknown company ${c}`);
  }
  board.rules.forEach((r, slot) => {
    if ("a" in r && (!Number.isInteger(r.a) || r.a < 0 || r.a >= n || r.a === slot)) {
      out.push(`slot ${slot} (${r.type}) points at slot ${r.a}`);
    }
    // breadth counts how many stocks rose or fell last round, so k must be reachable.
    if (r.type === "breadth" && (r.k < 1 || r.k > n - 1)) out.push(`slot ${slot} breadth k=${r.k} needs 1..${n - 1}`);
    if (r.type === "band" && !(r.l >= 1 && r.h > r.l)) out.push(`slot ${slot} band needs 1 <= l < h`);
  });
  // Every logo stock would draw the same path: one per board.
  if (board.rules.filter((r) => r.type === "logo").length > 1) out.push("more than one logo rule");
  // follow chains must end somewhere; a loop would silently read as "did not rise".
  board.rules.forEach((_, start) => {
    const seen = new Set<number>();
    let at = start;
    while (board.rules[at]?.type === "follow") {
      if (seen.has(at)) {
        out.push(`follow loop through slot ${start}`);
        break;
      }
      seen.add(at);
      at = (board.rules[at] as Extract<Rule, { type: "follow" }>).a;
    }
  });
  return out;
}

function defineBoard(id: string, board: Board): Board {
  const problems = boardProblems(board);
  if (problems.length) throw new Error(`Board "${id}": ${problems.join("; ")}`);
  return board;
}

/**
 * Deal a board's rules to its companies in a seeded random order. References
 * move with their targets: if rule j points at the rule in slot a, after the
 * deal it points at wherever that rule landed. The result is a different
 * puzzle with exactly the same structure.
 */
export function dealBoard(board: Board, rng: RngState): Board {
  const n = board.rules.length;
  const order = shuffle(rng, [...Array(n).keys()]); // new slot i gets old rule order[i]
  const landed: number[] = []; // landed[old slot] = new slot
  order.forEach((old, i) => (landed[old] = i));
  const rules = order.map((old) => {
    const r = { ...board.rules[old]! };
    if ("a" in r) r.a = landed[r.a]!;
    return r;
  });
  return { ...board, rules };
}

export const BOARDS: Record<BoardId, Board> = {
  // The show's rule set (fan reconstruction of the broadcast). The logo stock
  // follows SHOW_LOGO, the "M" drawn as the game logo on every screen.
  show: defineBoard("show", {
    companies: [OPEN, COYO, LATTER, DEFENSE, AIRTIGHT, SEASONED, ALT],
    rules: [
      { type: "secret", a: LATTER, x: 13, y: 1000 },
      { type: "cmpBuy", a: LATTER, x: 1400, y: 700 },
      { type: "band", l: 10, h: 30, x: 1500, y: 1000 },
      { type: "perShare", p: 200 },
      { type: "follow", a: DEFENSE, x: 10, y: 10 },
      { type: "breadth", k: 4, x: 20, y: 10 },
      { type: "logo" },
    ],
  }),
  // Four companies and four of the easiest rules to read: a first game.
  beginning: defineBoard("beginning", {
    companies: [OPEN, COYO, LATTER, DEFENSE],
    rules: [
      { type: "sellBuy", x: 1200, y: 600 },
      { type: "cmpBuy", a: 0, x: 1400, y: 700 },
      { type: "band", l: 5, h: 20, x: 1500, y: 1000 },
      { type: "follow", a: 1, x: 10, y: 10 },
    ],
  }),
  // The show's seven companies, each with a different rule than on the show.
  season2: defineBoard("season2", {
    companies: [OPEN, COYO, LATTER, DEFENSE, AIRTIGHT, SEASONED, ALT],
    rules: [
      { type: "holdRank", x: 10, y: 600 },
      { type: "cheapest", x: 15, y: 600 },
      { type: "follow", a: 5, x: 12, y: 8 },
      { type: "secret", a: 4, x: 13, y: 1000 },
      { type: "sellBuy", x: 1400, y: 700 },
      { type: "cmpBuy", a: 0, x: 1300, y: 800 },
      { type: "breadth", k: 4, x: 20, y: 10 },
    ],
  }),
  // Nine companies: the show's seven plus Tidal Energy and Halo Pharma.
  grand: defineBoard("grand", {
    companies: [OPEN, COYO, LATTER, DEFENSE, AIRTIGHT, SEASONED, ALT, TIDAL, HALO],
    rules: [
      { type: "perShare", p: 150 },
      { type: "follow", a: 7, x: 10, y: 10 },
      { type: "holdRank", x: 12, y: 500 },
      { type: "cmpBuy", a: 8, x: 1400, y: 700 },
      { type: "secret", a: 6, x: 13, y: 900 },
      { type: "band", l: 10, h: 40, x: 1500, y: 1000 },
      { type: "logo" },
      { type: "breadth", k: 5, x: 18, y: 10 },
      { type: "sellBuy", x: 1300, y: 700 },
    ],
  }),
};

/** The show's rules, by slot (= company, on the show's board). */
export const SHOW_RULES: readonly Rule[] = BOARDS.show.rules;

export function isBoard(ruleSet: RuleSet): ruleSet is BoardId {
  return ruleSet in BOARDS;
}
