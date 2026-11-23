import { describe, expect, it } from "vitest";
import {
  applyAction,
  BOARD_IDS,
  BOARDS,
  boardProblems,
  CLASSIC_COMPANIES,
  companiesOf,
  createGame,
  dealBoard,
  DEFAULT_CONFIG,
  PRICE_FLOOR,
  project,
  replay,
  seedRng,
  settleRound,
  SHOW_RULES,
  START_PRICE,
  STOCK_IDS,
  TOTAL_ROUNDS,
  type Action,
  type Board,
  type GameInit,
  type RoomState,
  type Rule,
  type RuleSet,
} from "../../src/engine";
import { ViewZ } from "../../src/shared/protocol";
import { stockName } from "../../src/shared/ruleTemplates";

const SEATS: GameInit["seats"] = [
  { id: "a", name: "Ana" },
  { id: "b1", name: "Bot 1", bot: { skill: "hard" } },
  { id: "b2", name: "Bot 2", bot: { skill: "normal" } },
  { id: "b3", name: "Bot 3", bot: { skill: "easy" } },
];

/** Play a whole game with three bots and a human who never trades. */
function playBoard(ruleSet: RuleSet, seed: string) {
  const g = createGame({ seed, ruleSet, seats: SEATS });
  while (!g.finished) settleRound(g);
  return g;
}

/** Play a whole game on an arbitrary board definition (used for shuffled deals). */
function playDefinition(board: Board, seed: string) {
  const g = createGame({ seed, ruleSet: "beginning", seats: SEATS });
  const n = board.companies.length;
  // Swap the board in before anything has happened: same shape as createGame would build.
  g.companies = board.companies.slice();
  g.rules = board.rules.map((r) => ({ ...r }));
  g.prices = new Array(n).fill(START_PRICE);
  g.history = [g.prices.slice()];
  g.buyVol = new Array(n).fill(0);
  g.sellVol = new Array(n).fill(0);
  g.holdings = new Array(n).fill(0);
  g.prevHoldings = new Array(n).fill(0);
  for (const s of g.seats) {
    s.shares = new Array(n).fill(0);
    s.peeks = new Array(n).fill(0);
  }
  while (!g.finished) settleRound(g);
  return g;
}

function expectSaneGame(g: ReturnType<typeof playBoard>, n: number) {
  expect(g.history).toHaveLength(TOTAL_ROUNDS + 1);
  for (const prices of g.history) {
    expect(prices).toHaveLength(n);
    for (const p of prices) expect(Number.isInteger(p) && p >= PRICE_FLOOR).toBe(true);
  }
  for (const s of g.seats) {
    expect(s.shares).toHaveLength(n);
    expect(Number.isFinite(s.cash) && s.cash >= 0).toBe(true);
  }
  // Not a dead board: something still trades above the floor at the end.
  expect(g.prices.some((p) => p > PRICE_FLOOR)).toBe(true);
}

describe("hand-made boards", () => {
  it("have the sizes asked for", () => {
    expect(BOARDS.beginning.companies).toHaveLength(4);
    expect(BOARDS.season2.companies).toEqual([...CLASSIC_COMPANIES]);
    expect(BOARDS.grand.companies).toHaveLength(9);
    expect(BOARDS.grand.companies.map((c) => STOCK_IDS[c])).toContain("tidal");
    expect(BOARDS.grand.companies.map((c) => STOCK_IDS[c])).toContain("halo");
  });

  it("Season 2 gives every show company a different rule type than the show does", () => {
    BOARDS.season2.rules.forEach((r, slot) => expect(r.type).not.toBe(SHOW_RULES[slot]!.type));
  });

  it.each(BOARD_IDS)("%s passes the board checks", (id) => {
    expect(boardProblems(BOARDS[id])).toEqual([]);
  });

  it.each(BOARD_IDS)("%s plays 24 rounds with bots and keeps prices sane", (id) => {
    for (const seed of ["s1", "s2", "s3"]) {
      const g = playBoard(id, seed);
      expect(g.companies).toEqual(BOARDS[id].companies);
      expectSaneGame(g, BOARDS[id].companies.length);
    }
  });

  it.each(BOARD_IDS)("%s replays exactly from seed and actions", (id) => {
    const init: GameInit = { seed: `replay-${id}`, ruleSet: id, seats: SEATS };
    const g = createGame(init);
    const log: Action[] = [];
    const act = (a: Action) => {
      if (applyAction(g, a).ok) log.push(a);
    };
    act({ t: "trade", seat: "a", stock: 0, side: "buy", qty: 3 });
    act({ t: "settle" });
    act({ t: "secret", seat: "a", stock: 1 });
    act({ t: "piece", seat: "a", kind: "peek", stock: 2 });
    act({ t: "settle" });
    expect(replay(init, log)).toEqual(g);
  });

  it("rejects trades on slots that are not on the board", () => {
    const small = createGame({ seed: "x", ruleSet: "beginning", seats: SEATS });
    expect(applyAction(small, { t: "trade", seat: "a", stock: 4, side: "buy", qty: 1 })).toEqual({
      ok: false,
      code: "bad_stock",
    });
    const big = createGame({ seed: "x", ruleSet: "grand", seats: SEATS });
    expect(applyAction(big, { t: "trade", seat: "a", stock: 8, side: "buy", qty: 1 })).toEqual({ ok: true });
    expect(applyAction(big, { t: "trade", seat: "a", stock: 9, side: "buy", qty: 1 }).ok).toBe(false);
  });
});

describe("shuffling rules between companies", () => {
  /** What a rule points at, described by the target's own rule, so it survives renumbering. */
  const signature = (board: Board, slot: number): string => {
    const r = board.rules[slot]!;
    const { a, ...rest } = r as Rule & { a?: number };
    const target = a === undefined ? "" : ` -> ${JSON.stringify({ ...board.rules[a]!, a: undefined })}`;
    return JSON.stringify(rest) + target;
  };

  it.each(BOARD_IDS)("%s: 25 seeded deals stay valid, keep every rule and every link, and still play", (id) => {
    const board = BOARDS[id];
    const before = board.rules.map((_, i) => signature(board, i)).sort();
    let changed = 0;
    for (let k = 0; k < 25; k++) {
      const dealt = dealBoard(board, seedRng(`deal-${id}-${k}`));
      expect(boardProblems(dealt)).toEqual([]);
      expect(dealt.companies).toEqual(board.companies);
      expect(dealt.rules.map((_, i) => signature(dealt, i)).sort()).toEqual(before);
      if (JSON.stringify(dealt.rules) !== JSON.stringify(board.rules)) changed++;
      if (k < 5) expectSaneGame(playDefinition(dealt, `deal-game-${k}`), board.companies.length);
    }
    expect(changed).toBeGreaterThan(20); // the deals really move rules around
  });
});

describe("board checks catch mistakes", () => {
  const base = (): Board => ({
    companies: [0, 1, 2, 3],
    rules: [
      { type: "sellBuy", x: 1000, y: 500 },
      { type: "cmpBuy", a: 0, x: 1000, y: 500 },
      { type: "perShare", p: 100 },
      { type: "follow", a: 1, x: 10, y: 10 },
    ],
  });
  const problemsWith = (edit: (b: Board) => void) => {
    const b = base();
    edit(b);
    return boardProblems(b);
  };

  it("accepts the base board", () => expect(boardProblems(base())).toEqual([]));
  it("a rule pointing at itself", () => expect(problemsWith((b) => ((b.rules[1] as { a: number }).a = 1))).not.toEqual([]));
  it("a rule pointing off the board", () => expect(problemsWith((b) => ((b.rules[1] as { a: number }).a = 4))).not.toEqual([]));
  it("a company listed twice", () => expect(problemsWith((b) => (b.companies[3] = 0))).not.toEqual([]));
  it("an unknown company", () => expect(problemsWith((b) => (b.companies[3] = 99))).not.toEqual([]));
  it("rules and companies out of step", () => expect(problemsWith((b) => b.rules.pop())).not.toEqual([]));
  it("breadth that can never trigger", () =>
    expect(problemsWith((b) => (b.rules[2] = { type: "breadth", k: 4, x: 10, y: 10 }))).not.toEqual([]));
  it("two logo stocks", () =>
    expect(
      problemsWith((b) => {
        b.rules[0] = { type: "logo" };
        b.rules[2] = { type: "logo" };
      }),
    ).not.toEqual([]));
  it("a follow loop", () =>
    expect(
      problemsWith((b) => {
        b.rules[0] = { type: "follow", a: 3, x: 10, y: 10 };
        b.rules[1] = { type: "follow", a: 0, x: 10, y: 10 };
      }),
    ).not.toEqual([]));
});

describe("views", () => {
  it("project a 9-company board with the new companies named in rules and on the board", () => {
    const init: GameInit = { seed: "proj-9", ruleSet: "grand", seats: SEATS.slice(0, 2) };
    const game = createGame(init);
    const room: RoomState = {
      v: 1,
      code: "ABCDE",
      origin: "https://example.test",
      createdAt: 0,
      hostToken: "h".repeat(32),
      hostId: "a",
      config: { ...DEFAULT_CONFIG, ruleSet: "grand" },
      players: [{ id: "a", name: "Ana", token: "a".repeat(32), bot: false, kicked: false, ready: false, lastSeq: 0 }],
      displays: [],
      phase: "finished",
      countdownEnd: null,
      deadline: null,
      pausedRemaining: null,
      earlyEndAt: null,
      game,
      gameInit: init,
      gameNo: 1,
      events: [],
      eventSeq: 0,
      lastActivity: 0,
      finishedAt: 0,
    };
    while (!game.finished) settleRound(game);
    const view = project(room, { role: "host", playerId: "a", lang: "en" }, { connected: new Set(["a"]), spectators: 0, now: 0 });
    expect(ViewZ.parse(view)).toBeTruthy();
    expect(view.companies).toEqual(BOARDS.grand.companies);
    expect(view.stocks).toHaveLength(9);
    expect(view.me?.shares).toHaveLength(9);
    // CoyoTech (slot 1) follows slot 7, which is Tidal Energy.
    const rule1 = view.results!.rules[1]!.map((t) => t.text).join(" ");
    expect(rule1).toContain(stockName(STOCK_IDS.indexOf("tidal"), "en"));
  });

  it("show and random boards still hold the show's seven companies, in order", () => {
    for (const rs of ["show", "random"] as const) {
      const g = createGame({ seed: "seven", ruleSet: rs, seats: SEATS });
      expect(companiesOf(g)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(g.prices).toEqual(new Array(7).fill(START_PRICE));
    }
  });

  it("games saved before boards existed still read as the show's seven companies", () => {
    const g = createGame({ seed: "old", ruleSet: "show", seats: SEATS });
    delete g.companies;
    expect(companiesOf(g)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
