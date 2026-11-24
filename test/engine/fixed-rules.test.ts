import { describe, expect, it } from "vitest";
import {
  BOARDS,
  boardProblems,
  createGame,
  LOGO_IDS,
  logoPath,
  logoShape,
  PRICE_FLOOR,
  RULE_TYPES,
  settle,
  settleRound,
  SHOW_LOGO,
  START_PRICE,
  TOTAL_ROUNDS,
  type Board,
  type Rule,
  type SettleCtx,
} from "../../src/engine";
import { renderRule } from "../../src/shared/ruleTemplates";

function ctx(round: number, price = 10_000): SettleCtx {
  return {
    round,
    prices: [price, 10_000],
    prevMoves: null,
    buyVol: [50, 0],
    sellVol: [0, 30],
    holdings: [50, 0],
    prevHoldings: [0, 30],
    hiddenNext: [false, false],
    logo: SHOW_LOGO.slice(),
  };
}
const one = (rule: Rule, c: SettleCtx) => settle([rule, { type: "perShare", p: 0 }], c)[0];

describe("fixed rules ignore what players do", () => {
  it("steady adds the same amount every round", () => {
    for (const r of [1, 2, 13, 24]) expect(one({ type: "steady", x: 300 }, ctx(r))).toBe(10_300);
  });
  it("growth adds the same percentage every round (rounded down)", () => {
    expect(one({ type: "growth", x: 3 }, ctx(1))).toBe(10_300);
    expect(one({ type: "growth", x: 3 }, ctx(2, 10_333))).toBe(10_642);
  });
  it("alternate rises in odd rounds and falls in even rounds", () => {
    const rule: Rule = { type: "alternate", x: 1200, y: 900 };
    expect(one(rule, ctx(1))).toBe(11_200);
    expect(one(rule, ctx(2))).toBe(9_100);
    expect(one(rule, ctx(23))).toBe(11_200);
  });
  it("never drops below the price floor", () => {
    expect(one({ type: "alternate", x: 0, y: 5000 }, ctx(2, 300))).toBe(PRICE_FLOOR);
  });
  it("have text in every language that names the amounts", () => {
    for (const lang of ["en", "hu", "ko"] as const) {
      expect(renderRule({ type: "steady", x: 300 }, 0, lang).map((t) => t.text).join(" ")).toMatch(/300/);
      expect(renderRule({ type: "growth", x: 3 }, 0, lang).map((t) => t.text).join(" ")).toMatch(/3/);
      const alt = renderRule({ type: "alternate", x: 1200, y: 900 }, 0, lang).map((t) => t.text).join(" ");
      expect(alt).toMatch(/1[,. ]?200/);
      expect(alt).toMatch(/900/);
    }
  });
});

describe("logo shapes", () => {
  it("each opens at the start price, covers every round and stays above the floor", () => {
    for (const id of LOGO_IDS) {
      const path = logoPath(id);
      expect(path, id).toHaveLength(TOTAL_ROUNDS + 1);
      expect(path[0], id).toBe(START_PRICE);
      for (const v of path) expect(v >= PRICE_FLOOR && v % 100 === 0, `${id} ${v}`).toBe(true);
    }
  });
  it("are all different icons", () => {
    const shapes = LOGO_IDS.map((id) => JSON.stringify(logoShape(logoPath(id))));
    expect(new Set(shapes).size).toBe(LOGO_IDS.length);
  });
  it("the show's M is unchanged", () => {
    expect(logoPath("m")).toBe(SHOW_LOGO);
    expect(logoPath()).toBe(SHOW_LOGO);
  });
});

describe("Random's rule pool is frozen", () => {
  it("still draws from the original ten types only", () => {
    expect(RULE_TYPES).toEqual([
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
    ]);
  });
});

describe("fixed rules on a board", () => {
  const board: Board = {
    companies: [0, 1, 2, 3],
    logo: "wave",
    rules: [
      { type: "steady", x: 300 },
      { type: "growth", x: 3 },
      { type: "alternate", x: 1200, y: 900 },
      { type: "logo" },
    ],
  };
  it("pass the board checks", () => expect(boardProblems(board)).toEqual([]));
  it("a logo shape needs a logo rule", () =>
    expect(boardProblems({ ...board, rules: board.rules.map((r) => (r.type === "logo" ? { type: "steady", x: 1 } : r)) })).toContain(
      "picks a logo shape but has no logo rule",
    ));
  it("play exactly as written through a whole game with bots", () => {
    const g = createGame({
      seed: "fixed",
      ruleSet: "beginning",
      seats: [
        { id: "a", name: "A", bot: { skill: "hard" } },
        { id: "b", name: "B", bot: { skill: "easy" } },
      ],
    });
    g.rules = board.rules.map((r) => ({ ...r }));
    g.logo = logoPath("wave").slice();
    while (!g.finished) settleRound(g);
    const steady = g.history.map((p) => p[0]);
    expect(steady[TOTAL_ROUNDS]).toBe(START_PRICE + 300 * TOTAL_ROUNDS);
    const alt = g.history.map((p) => p[2]);
    expect(alt[1]).toBe(11_200);
    expect(alt[2]).toBe(10_300);
    expect(g.history.map((p) => p[3])).toEqual(logoPath("wave"));
  });
});

describe("boards that use them", () => {
  it("The Beginning has a steady riser and a swinger; Grand Market a grower and the bolt logo", () => {
    expect(BOARDS.beginning.rules.map((r) => r.type)).toEqual(["steady", "cmpBuy", "alternate", "follow"]);
    expect(BOARDS.grand.logo).toBe("bolt");
    expect(BOARDS.grand.rules.some((r) => r.type === "growth")).toBe(true);
    const g = createGame({ seed: "bolt", ruleSet: "grand", seats: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
    expect(g.logo).toEqual(logoPath("bolt"));
  });
});
