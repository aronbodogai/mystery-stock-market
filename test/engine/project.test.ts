import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  DEFAULT_CONFIG,
  project,
  settleRound,
  type GameInit,
  type RoomState,
  type Viewer,
} from "../../src/engine";
import { renderRule } from "../../src/shared/ruleTemplates";
import { ViewZ, type View } from "../../src/shared/protocol";

const TOKENS = {
  host: "h".repeat(32),
  a: "a".repeat(32),
  b: "b".repeat(32),
  display: "d".repeat(32),
};

function makeRoom(): RoomState {
  const init: GameInit = {
    seed: "leak-seed-xyz",
    ruleSet: "show",
    seats: [
      { id: "pa", name: "Ana" },
      { id: "pb", name: "Ben" },
      { id: "pc", name: "Cleo", bot: { skill: "hard" } },
    ],
  };
  const game = createGame(init);
  return {
    v: 1,
    code: "ABCDE",
    origin: "https://example.test",
    createdAt: 0,
    hostToken: TOKENS.host,
    hostId: "pa",
    config: { ...DEFAULT_CONFIG, seed: "leak-seed-xyz" },
    players: [
      { id: "pa", name: "Ana", token: TOKENS.a, bot: false, kicked: false, ready: false, lastSeq: 0 },
      { id: "pb", name: "Ben", token: TOKENS.b, bot: false, kicked: false, ready: true, lastSeq: 0 },
      { id: "pc", name: "Cleo", token: null, bot: true, kicked: false, ready: false, lastSeq: 0 },
    ],
    displays: [{ id: "tv1", token: TOKENS.display, createdAt: 0 }],
    phase: "trading",
    countdownEnd: null,
    deadline: 1_000_000,
    pausedRemaining: null,
    earlyEndAt: null,
    game,
    gameInit: init,
    gameNo: 1,
    events: [],
    eventSeq: 0,
    lastActivity: 0,
    finishedAt: null,
  };
}

const env = { connected: new Set(["pa", "pb"]), spectators: 1, now: 123 };
const viewers: Record<string, Viewer> = {
  host: { role: "host", playerId: "pa", lang: "en" },
  player: { role: "player", playerId: "pb", lang: "en" },
  display: { role: "display", playerId: null, lang: "en" },
  spectator: { role: "spectator", playerId: null, lang: "en" },
};

/** Room in round 2 with Latter (stock 2) hidden by Ana's secret. Ana holds Latter, Ben peeked stock 4. */
function hiddenScenario(): RoomState {
  const room = makeRoom();
  const g = room.game!;
  applyAction(g, { t: "trade", seat: "pa", stock: 2, side: "buy", qty: 2 });
  applyAction(g, { t: "trade", seat: "pa", stock: 1, side: "buy", qty: 3 });
  applyAction(g, { t: "trade", seat: "pb", stock: 5, side: "buy", qty: 1 });
  applyAction(g, { t: "secret", seat: "pa", stock: 2 });
  applyAction(g, { t: "piece", seat: "pb", kind: "peek", stock: 4 });
  settleRound(g);
  return room;
}

function allViews(room: RoomState): Record<string, View> {
  const out: Record<string, View> = {};
  for (const [k, v] of Object.entries(viewers)) out[k] = project(room, v, env);
  return out;
}

describe("project(): never leaks hidden information", () => {
  it("every projection passes the protocol schema", () => {
    for (const v of Object.values(allViews(hiddenScenario()))) expect(() => ViewZ.parse(v)).not.toThrow();
  });

  it("never contains tokens, the seed or RNG state while the game runs", () => {
    const room = hiddenScenario();
    for (const [who, v] of Object.entries(allViews(room))) {
      const json = JSON.stringify(v);
      for (const tok of Object.values(TOKENS)) expect(json, who).not.toContain(tok);
      expect(json, who).not.toContain("leak-seed-xyz");
      expect(json, who).not.toContain("rng");
      expect(json, who).not.toContain("insightRound");
      expect(json, who).not.toContain("style");
    }
  });

  it("hides price, delta, stats and chart point of a hidden stock for everyone", () => {
    const room = hiddenScenario();
    const g = room.game!;
    const real = g.prices[2]!;
    for (const [who, v] of Object.entries(allViews(room))) {
      const s = v.stocks[2]!;
      expect(s.hidden, who).toBe(true);
      expect(s.price, who).toBeNull();
      expect(s.delta, who).toBeNull();
      expect(s.last, who).toBeNull();
      expect(s.chart[1], who).toBeNull();
      expect(s.chart, who).not.toContain(real);
    }
  });

  it("hides net worth in standings while any secret is active, but keeps the order", () => {
    for (const [who, v] of Object.entries(allViews(hiddenScenario()))) {
      expect(v.anySecret, who).toBe(true);
      expect(v.standings.length, who).toBe(3);
      for (const row of v.standings) {
        expect(row.net, who).toBeNull();
        expect(Object.keys(row)).not.toContain("cash");
        expect(Object.keys(row)).not.toContain("shares");
      }
    }
  });

  it("hides own cash and net worth while holding a hidden stock", () => {
    const v = allViews(hiddenScenario());
    expect(v.host!.me!.blind).toBe(true);
    expect(v.host!.me!.cash).toBeNull();
    expect(v.host!.me!.net).toBeNull();
    // The changes would leak the hidden price too.
    expect(v.host!.me!.cashDelta).toBeNull();
    expect(v.host!.me!.netDelta).toBeNull();
    expect(v.player!.me!.blind).toBe(false);
    expect(v.player!.me!.cash).not.toBeNull();
    expect(typeof v.player!.me!.cashDelta).toBe("number");
    expect(typeof v.player!.me!.netDelta).toBe("number");
  });

  it("shows who placed a secret only to the placer", () => {
    const v = allViews(hiddenScenario());
    expect(v.host!.me!.secretStock).toBe(2);
    expect(v.player!.me!.secretStock).toBeNull();
    expect(v.display!.me).toBeNull();
    expect(v.spectator!.me).toBeNull();
    for (const k of ["player", "display", "spectator"]) {
      const json = JSON.stringify(v[k]);
      expect(json).not.toContain("secretRound\":1");
    }
  });

  it("never shows other players' cash, shares or pieces", () => {
    const room = hiddenScenario();
    const v = allViews(room);
    // Ben only ever sees his own seat.
    expect(v.player!.me!.seatId).toBe("pb");
    expect(v.player!.me!.shares).toEqual(room.game!.seats[1]!.shares);
    expect(v.display!.me).toBeNull();
    const anaCash = room.game!.seats[0]!.cash;
    for (const k of ["player", "display", "spectator"]) {
      const json = JSON.stringify(v[k]);
      expect(json).not.toContain(`"cash":${anaCash}`);
      expect(json).not.toContain(`"pieces":${room.game!.seats[0]!.pieces},"secretStock":2`);
    }
  });

  it("redacts hidden rule groups to lengths; peeks are private to the peeker", () => {
    const room = hiddenScenario();
    const v = allViews(room);
    for (const [who, view] of Object.entries(v)) {
      view.stocks.forEach((s, i) => {
        const full = renderRule(room.game!.rules[i]!, i, "en");
        s.rule.forEach((tok, j) => {
          if (tok.g > s.level) {
            expect("text" in tok, `${who} stock ${i}`).toBe(false);
            expect("len" in tok && tok.len).toBe([...full[j]!.text].length);
          }
        });
      });
    }
    // Round 2: public level is 0; Ben peeked group 1 of stock 4.
    expect(v.player!.stocks[4]!.level).toBe(1);
    expect(v.host!.stocks[4]!.level).toBe(0);
    expect(v.display!.stocks[4]!.level).toBe(0);
    const g1 = v.player!.stocks[4]!.rule.find((t) => t.g === 1)!;
    expect("text" in g1).toBe(true);
    const hostG1 = v.host!.stocks[4]!.rule.find((t) => t.g === 1)!;
    expect("text" in hostG1).toBe(false);
  });

  it("only the host sees displays and the seed (in the lobby)", () => {
    const room = makeRoom();
    room.phase = "lobby";
    room.game = null;
    const host = project(room, viewers.host!, env);
    const player = project(room, viewers.player!, env);
    expect(host.host).not.toBeNull();
    expect(host.config.seed).toBe("leak-seed-xyz");
    expect(player.host).toBeNull();
    expect(player.config.seed).toBe("");
  });

  it("reveals full rules, seed and history once the game is finished", () => {
    const room = hiddenScenario();
    while (!room.game!.finished) settleRound(room.game!);
    room.phase = "finished";
    for (const [who, v] of Object.entries(allViews(room))) {
      expect(v.results, who).not.toBeNull();
      expect(v.results!.seed).toBe("leak-seed-xyz");
      expect(v.results!.history.length).toBe(25);
      for (const s of v.stocks) {
        expect(s.hidden).toBe(false);
        expect(s.rule.every((t) => "text" in t)).toBe(true);
      }
      // still never any tokens
      const json = JSON.stringify(v);
      for (const tok of Object.values(TOKENS)) expect(json).not.toContain(tok);
    }
  });

  it("renders rules in the host's game language for everyone once the game has started", () => {
    const room = hiddenScenario();
    room.config.lang = "hu";
    const texts = (["en", "hu", "ko"] as const).map((lang) => {
      const v = project(room, { role: "player", playerId: "pb", lang }, env);
      return JSON.stringify(v.stocks.map((s) => s.rule));
    });
    expect(texts[0]).toBe(texts[1]);
    expect(texts[1]).toBe(texts[2]);
    expect(texts[0]).toContain("Különben"); // Hungarian rule text
  });

  it("renders rules in the viewer's language with matching groups", () => {
    const room = hiddenScenario();
    for (const lang of ["en", "hu", "ko"] as const) {
      const v = project(room, { role: "display", playerId: null, lang }, env);
      v.stocks.forEach((s) => {
        const groups = new Set(s.rule.map((t) => t.g));
        // every rule covers groups 0..4 in every language
        for (let gNo = 0; gNo <= 4; gNo++) expect(groups.has(gNo)).toBe(true);
      });
    }
  });
});
