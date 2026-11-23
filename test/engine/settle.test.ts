import { describe, expect, it } from "vitest";
import { settle, pctChange, SHOW_LOGO, SHOW_RULES, type Rule, type SettleCtx } from "../../src/engine";

const z = () => [0, 0, 0, 0, 0, 0, 0];

function ctx(over: Partial<SettleCtx> = {}): SettleCtx {
  return {
    round: 2,
    prices: [10000, 10000, 10000, 10000, 10000, 10000, 10000],
    prevMoves: [0, 0, 0, 0, 0, 0, 0],
    buyVol: z(),
    sellVol: z(),
    holdings: z(),
    prevHoldings: z(),
    hiddenNext: [false, false, false, false, false, false, false],
    logo: SHOW_LOGO.slice(),
    ...over,
  };
}

/** Put `rule` on stock 0 and inert logo rules elsewhere; return stock 0's new price. */
function one(rule: Rule, c: SettleCtx): number {
  const rules: Rule[] = [rule, ...Array.from({ length: 6 }, () => ({ type: "perShare", p: 0 }) as Rule)];
  return settle(rules, c)[0]!;
}

describe("pctChange", () => {
  it("uses integer floor math", () => {
    expect(pctChange(10001, 13)).toBe(11301); // 11301.13 -> 11301
    expect(pctChange(999, -10)).toBe(899); // 899.1 -> 899
  });
});

describe("cmpBuy", () => {
  const rule: Rule = { type: "cmpBuy", a: 2, x: 1400, y: 700 };
  it("rises when buy volume beats the target", () => {
    expect(one(rule, ctx({ buyVol: [5, 0, 4, 0, 0, 0, 0] }))).toBe(11400);
  });
  it("falls on a tie", () => {
    expect(one(rule, ctx({ buyVol: [4, 0, 4, 0, 0, 0, 0] }))).toBe(9300);
  });
  it("falls when both are zero", () => {
    expect(one(rule, ctx())).toBe(9300);
  });
  it("counts wash trading: buy 10 + sell 10 still adds 10 buy volume", () => {
    expect(one(rule, ctx({ buyVol: [10, 0, 9, 0, 0, 0, 0], sellVol: [10, 0, 0, 0, 0, 0, 0] }))).toBe(11400);
  });
});

describe("band", () => {
  const rule: Rule = { type: "band", l: 10, h: 30, x: 1500, y: 1000 };
  it("includes both edges", () => {
    expect(one(rule, ctx({ holdings: [10, 0, 0, 0, 0, 0, 0] }))).toBe(11500);
    expect(one(rule, ctx({ holdings: [30, 0, 0, 0, 0, 0, 0] }))).toBe(11500);
  });
  it("excludes just outside the edges", () => {
    expect(one(rule, ctx({ holdings: [9, 0, 0, 0, 0, 0, 0] }))).toBe(9000);
    expect(one(rule, ctx({ holdings: [31, 0, 0, 0, 0, 0, 0] }))).toBe(9000);
  });
  it("treats zero as outside", () => {
    expect(one({ type: "band", l: 0, h: 5, x: 1500, y: 1000 }, ctx())).toBe(9000);
  });
});

describe("perShare", () => {
  const rule: Rule = { type: "perShare", p: 200 };
  it("falls per share that holdings rose", () => {
    expect(one(rule, ctx({ holdings: [15, 0, 0, 0, 0, 0, 0], prevHoldings: [10, 0, 0, 0, 0, 0, 0] }))).toBe(9000);
  });
  it("rises per share that holdings fell", () => {
    expect(one(rule, ctx({ holdings: [5, 0, 0, 0, 0, 0, 0], prevHoldings: [10, 0, 0, 0, 0, 0, 0] }))).toBe(11000);
  });
  it("is clamped to the floor", () => {
    expect(one(rule, ctx({ holdings: [1000, 0, 0, 0, 0, 0, 0] }))).toBe(100);
  });
});

describe("follow", () => {
  it("is evaluated after the stock it follows", () => {
    // Stock 0 follows stock 1; stock 1 rises via cmpBuy beating stock 2.
    const rules: Rule[] = [
      { type: "follow", a: 1, x: 10, y: 10 },
      { type: "cmpBuy", a: 2, x: 1000, y: 500 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
    ];
    expect(settle(rules, ctx({ buyVol: [0, 3, 0, 0, 0, 0, 0] }))[0]).toBe(11000);
    expect(settle(rules, ctx())[0]).toBe(9000);
  });
  it("can follow another follow rule, in either index order", () => {
    const rules: Rule[] = [
      { type: "perShare", p: 0 },
      { type: "follow", a: 6, x: 10, y: 10 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
      { type: "perShare", p: 0 },
      { type: "follow", a: 0, x: 10, y: 10 },
    ];
    // stock 0 unchanged -> 6 did not rise -> 6 falls -> 1 falls
    const out = settle(rules, ctx());
    expect(out[6]).toBe(9000);
    expect(out[1]).toBe(9000);
  });
  it("treats a cycle as 'did not rise' instead of looping", () => {
    const rules: Rule[] = [
      { type: "follow", a: 1, x: 10, y: 10 },
      { type: "follow", a: 0, x: 10, y: 10 },
      ...Array.from({ length: 5 }, () => ({ type: "perShare", p: 0 }) as Rule),
    ];
    const out = settle(rules, ctx());
    expect(out[0]).toBeLessThan(10000);
    expect(out[1]).toBeLessThan(10000);
  });
});

describe("breadth", () => {
  const rule: Rule = { type: "breadth", k: 4, x: 20, y: 10 };
  it("does nothing in round 1", () => {
    expect(one(rule, ctx({ round: 1, prevMoves: null }))).toBe(10000);
  });
  it("rises when 4+ rose", () => {
    expect(one(rule, ctx({ prevMoves: [1, 1, 1, 1, 0, -1, -1] }))).toBe(12000);
  });
  it("falls when 4+ fell", () => {
    expect(one(rule, ctx({ prevMoves: [-1, -1, -1, -1, 0, 1, 1] }))).toBe(9000);
  });
  it("does not count a stock pinned at the floor as falling", () => {
    // Three real falls plus one stock that stayed at the floor (move 0).
    expect(one(rule, ctx({ prevMoves: [-1, -1, -1, 0, 0, 1, 1] }))).toBe(10000);
  });
});

describe("secret", () => {
  const rule: Rule = { type: "secret", a: 2, x: 13, y: 1000 };
  it("rises when the target will be hidden next round", () => {
    const hiddenNext = [false, false, true, false, false, false, false];
    expect(one(rule, ctx({ hiddenNext }))).toBe(11300);
  });
  it("falls by a flat amount otherwise", () => {
    expect(one(rule, ctx())).toBe(9000);
  });
});

describe("logo", () => {
  it("follows the logo path", () => {
    expect(one({ type: "logo" }, ctx({ round: 6 }))).toBe(SHOW_LOGO[6]);
  });
});

describe("sellBuy / cheapest / holdRank", () => {
  it("sellBuy rises only when sells beat buys", () => {
    const rule: Rule = { type: "sellBuy", x: 1000, y: 500 };
    expect(one(rule, ctx({ sellVol: [3, 0, 0, 0, 0, 0, 0], buyVol: [2, 0, 0, 0, 0, 0, 0] }))).toBe(11000);
    expect(one(rule, ctx({ sellVol: [2, 0, 0, 0, 0, 0, 0], buyVol: [2, 0, 0, 0, 0, 0, 0] }))).toBe(9500);
  });
  it("cheapest counts ties", () => {
    const rule: Rule = { type: "cheapest", x: 10, y: 500 };
    expect(one(rule, ctx())).toBe(11000); // all equal -> tie for cheapest
    expect(one(rule, ctx({ prices: [10000, 9000, 10000, 10000, 10000, 10000, 10000] }))).toBe(9500);
  });
  it("holdRank needs >0 and counts ties", () => {
    const rule: Rule = { type: "holdRank", x: 10, y: 500 };
    expect(one(rule, ctx())).toBe(10500); // zero holdings never rank first
    expect(one(rule, ctx({ holdings: [5, 5, 0, 0, 0, 0, 0] }))).toBe(9000);
    expect(one(rule, ctx({ holdings: [4, 5, 0, 0, 0, 0, 0] }))).toBe(10500);
  });
});

describe("floor", () => {
  it("never settles below 100", () => {
    const c = ctx({ prices: [150, 150, 150, 150, 150, 150, 150] });
    const out = settle(SHOW_RULES, c);
    for (const p of out) expect(p).toBeGreaterThanOrEqual(100);
  });
});
