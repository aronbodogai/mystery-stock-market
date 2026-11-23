import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  isHidden,
  ranking,
  replay,
  settleRound,
  TOTAL_ROUNDS,
  type Action,
  type BotSkill,
  type GameInit,
} from "../../src/engine";

function init(over: Partial<GameInit> = {}): GameInit {
  return {
    seed: "test-seed",
    ruleSet: "show",
    seats: [
      { id: "a", name: "Ana" },
      { id: "b", name: "Ben" },
    ],
    ...over,
  };
}

describe("trades", () => {
  it("buys and sells at the round price with volume and holdings", () => {
    const g = createGame(init());
    expect(applyAction(g, { t: "trade", seat: "a", stock: 0, side: "buy", qty: 3 })).toEqual({ ok: true });
    expect(applyAction(g, { t: "trade", seat: "a", stock: 0, side: "sell", qty: 1 })).toEqual({ ok: true });
    expect(g.seats[0]!.cash).toBe(100_000 - 20_000);
    expect(g.holdings[0]).toBe(2);
    expect(g.buyVol[0]).toBe(3);
    expect(g.sellVol[0]).toBe(1);
  });
  it("rejects overspending and overselling", () => {
    const g = createGame(init());
    expect(applyAction(g, { t: "trade", seat: "a", stock: 0, side: "buy", qty: 11 })).toEqual({
      ok: false,
      code: "insufficient_cash",
    });
    expect(applyAction(g, { t: "trade", seat: "a", stock: 0, side: "sell", qty: 1 })).toEqual({
      ok: false,
      code: "not_enough_shares",
    });
    expect(applyAction(g, { t: "trade", seat: "a", stock: 0, side: "buy", qty: 0 })).toMatchObject({ ok: false });
    expect(applyAction(g, { t: "trade", seat: "a", stock: 9, side: "buy", qty: 1 })).toMatchObject({ ok: false });
  });
});

describe("secrets", () => {
  it("hides a stock for exactly the two rounds after placement", () => {
    const g = createGame(init());
    expect(applyAction(g, { t: "secret", seat: "a", stock: 2 })).toEqual({ ok: true }); // round 1
    expect(isHidden(g, 2, 1)).toBe(false);
    expect(isHidden(g, 2, 2)).toBe(true);
    expect(isHidden(g, 2, 3)).toBe(true);
    expect(isHidden(g, 2, 4)).toBe(false);
    expect(applyAction(g, { t: "secret", seat: "a", stock: 3 })).toEqual({ ok: false, code: "secret_used" });
  });
  it("boosts Open Security in both settlements of the window (show rules)", () => {
    const g = createGame(init());
    applyAction(g, { t: "secret", seat: "a", stock: 2 }); // Latter, round 1
    const r1 = settleRound(g); // Latter hidden in round 2 -> +13%
    expect(r1.after[0]).toBe(11300);
    const r2 = settleRound(g); // Latter hidden in round 3 -> +13%
    expect(r2.after[0]).toBe(Math.floor((11300 * 113) / 100));
    const r3 = settleRound(g); // not hidden in round 4 -> -1000
    expect(r3.after[0]).toBe(r2.after[0]! - 1000);
  });
  it("a later secret on an already-hidden stock runs from its own placement", () => {
    const g = createGame(init());
    applyAction(g, { t: "secret", seat: "a", stock: 4 }); // round 1 -> hides 2,3
    settleRound(g);
    applyAction(g, { t: "secret", seat: "b", stock: 4 }); // round 2 -> hides 3,4
    expect(isHidden(g, 4, 3)).toBe(true);
    expect(isHidden(g, 4, 4)).toBe(true);
    expect(isHidden(g, 4, 5)).toBe(false);
  });
});

describe("pieces", () => {
  it("cash adds 10,000 and peeks advance one group; closes after round 20", () => {
    const g = createGame(init());
    expect(applyAction(g, { t: "piece", seat: "a", kind: "cash" })).toEqual({ ok: true });
    expect(g.seats[0]!.cash).toBe(110_000);
    expect(applyAction(g, { t: "piece", seat: "a", kind: "peek", stock: 1 })).toEqual({ ok: true });
    expect(g.seats[0]!.peeks[1]).toBe(1);
    expect(g.seats[0]!.pieces).toBe(1);
    for (let i = 0; i < 20; i++) settleRound(g);
    expect(g.round).toBe(21);
    expect(applyAction(g, { t: "piece", seat: "a", kind: "cash" })).toEqual({ ok: false, code: "pieces_closed" });
  });
  it("refuses a peek on a fully visible rule and keeps the piece", () => {
    const g = createGame(init());
    g.seats[0]!.peeks[0] = 4;
    expect(applyAction(g, { t: "piece", seat: "a", kind: "peek", stock: 0 })).toEqual({
      ok: false,
      code: "rule_fully_visible",
    });
    expect(g.seats[0]!.pieces).toBe(3);
  });
});

describe("replay", () => {
  it("seed + action log replays to the identical state", () => {
    const i = init({
      ruleSet: "random",
      seed: "replay-me",
      seats: [
        { id: "a", name: "Ana" },
        { id: "b", name: "Ben" },
        { id: "x", name: "Bot X", bot: { skill: "hard" } },
        { id: "y", name: "Bot Y", bot: { skill: "normal" } },
      ],
    });
    const g = createGame(i);
    const log: Action[] = [];
    const act = (a: Action) => {
      if (applyAction(g, a).ok) log.push(a);
    };
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      act({ t: "trade", seat: "a", stock: r % 7, side: "buy", qty: 2 });
      act({ t: "trade", seat: "b", stock: (r + 3) % 7, side: "buy", qty: 1 });
      if (r % 3 === 0) act({ t: "trade", seat: "a", stock: (r - 1) % 7, side: "sell", qty: 2 });
      if (r === 6) act({ t: "secret", seat: "b", stock: 2 });
      if (r === 2) act({ t: "piece", seat: "a", kind: "peek", stock: 5 });
      act({ t: "settle" });
    }
    expect(g.finished).toBe(true);
    const again = replay(i, log);
    expect(again).toEqual(g);
  });
});

describe("full simulated games", () => {
  for (const skill of ["easy", "normal", "hard"] as BotSkill[]) {
    for (const ruleSet of ["show", "random"] as const) {
      it(`${skill} bots, ${ruleSet} rules: finishes with no negative cash or shares`, () => {
        const seats = Array.from({ length: 12 }, (_, k) => ({ id: `s${k}`, name: `Bot ${k}`, bot: { skill } }));
        const g = createGame({ seed: `sim-${skill}-${ruleSet}`, ruleSet, seats });
        for (let r = 0; r < TOTAL_ROUNDS; r++) {
          settleRound(g);
          for (const s of g.seats) {
            expect(s.cash).toBeGreaterThanOrEqual(0);
            for (const q of s.shares) expect(q).toBeGreaterThanOrEqual(0);
          }
          for (const p of g.prices) expect(p).toBeGreaterThanOrEqual(100);
          const totals = g.holdings;
          g.seats.reduce((acc, s) => acc.map((v, i) => v + s.shares[i]!), [0, 0, 0, 0, 0, 0, 0]).forEach((v, i) => {
            expect(v).toBe(totals[i]);
          });
        }
        expect(g.finished).toBe(true);
        expect(g.history.length).toBe(TOTAL_ROUNDS + 1);
        const rk = ranking(g);
        expect(rk[0]!.rank).toBe(1);
        expect(rk.length).toBe(12);
      });
    }
  }
});

describe("cash and net worth baselines", () => {
  it("record cash at the start of each round and net worth at the end of the previous one", () => {
    const g = createGame(init());
    const a = g.seats[0]!;
    expect(a.baseCash).toBe(100_000);
    expect(a.baseNet).toBe(100_000);
    applyAction(g, { t: "trade", seat: "a", stock: 1, side: "buy", qty: 2 }); // CoyoTech at 10,000
    expect(a.cash - a.baseCash).toBe(-20_000); // cash change this round
    settleRound(g); // CoyoTech's buy volume beats Latter's: +1,400
    expect(a.baseCash).toBe(80_000);
    expect(a.baseNet).toBe(100_000);
    expect(80_000 + 2 * g.prices[1]! - a.baseNet).toBe(2 * 1_400); // net change from the settlement
  });
});

describe("ranking", () => {
  it("breaks ties by the higher lowest-ever net worth", () => {
    const g = createGame(init());
    g.seats[0]!.minNet = 50_000;
    g.seats[1]!.minNet = 90_000;
    const rk = ranking(g);
    expect(rk[0]!.seatId).toBe("b");
    expect(rk[0]!.rank).toBe(1);
    expect(rk[1]!.rank).toBe(2);
  });
});
