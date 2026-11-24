import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  BOARD_IDS,
  createGame,
  NUM_STOCKS,
  settleRound,
  type Action,
  type GameState,
} from "../../src/engine";
import { ClientMsgZ } from "../../src/shared/protocol";
import { seedRng, randInt, pick, rand } from "../../src/engine/rng";

/**
 * NFR-REL-2: Show and Random must play exactly as they always have, or saved
 * games stop replaying. These hashes are of whole games played from fixed seeds;
 * a change here means existing games would replay differently.
 */
describe("Show and Random never change behaviour (NFR-REL-2)", () => {
  const FINGERPRINTS: Record<string, string> = {
    "show/fp1": "2ca74597d48d7979",
    "show/fp2": "481285d389ef13c7",
    "show/fp3": "c42a202fc5e06c25",
    "random/fp1": "4e006948e9dec562",
    "random/fp2": "a2ef1ce19bf000ca",
    "random/fp3": "f3006415c4e4bfc9",
  };
  for (const [key, hash] of Object.entries(FINGERPRINTS)) {
    it(key, () => {
      const [ruleSet, seed] = key.split("/") as ["show" | "random", string];
      const g = createGame({
        seed,
        ruleSet,
        seats: [
          { id: "a", name: "A" },
          { id: "h", name: "H", bot: { skill: "hard" } },
          { id: "n", name: "N", bot: { skill: "normal" } },
        ],
      });
      applyAction(g, { t: "trade", seat: "a", stock: 2, side: "buy", qty: 4 });
      applyAction(g, { t: "secret", seat: "a", stock: 1 });
      while (!g.finished) settleRound(g);
      expect(createHash("sha256").update(JSON.stringify(g)).digest("hex").slice(0, 16)).toBe(hash);
    });
  }
});

/** NFR-MNT-2: the engine is pure: no clock, no Math.random, no I/O. */
describe("engine purity (NFR-MNT-2)", () => {
  const dir = join(__dirname, "../../src/engine");
  const banned = [/Math\.random/, /Date\.now/, /new Date\(/, /setTimeout|setInterval/, /\bfetch\(/, /performance\.now/, /localStorage/];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    it(file, () => {
      const code = readFileSync(join(dir, file), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      for (const re of banned) expect(code, `${file} uses ${re}`).not.toMatch(re);
    });
  }
});

/** NFR-REL-7: junk input never crashes validation or the engine, and failed actions change nothing. */
describe("fuzzing (NFR-REL-7)", () => {
  const junk = (r: ReturnType<typeof seedRng>): unknown => {
    const pool: unknown[] = [
      null,
      undefined,
      42,
      -1,
      1e308,
      Number.NaN,
      "",
      "x".repeat(5000),
      [],
      {},
      { type: "trade" },
      { type: "trade", stock: 99, side: "buy", qty: 1, seq: 1 },
      { type: "trade", stock: 0, side: "steal", qty: 1, seq: 1 },
      { type: "trade", stock: 0, side: "buy", qty: -5, seq: 1 },
      { type: "join", name: "<script>" },
      { type: "hello", lang: "xx" },
      { type: "__proto__" },
      { type: "setConfig", config: { ruleSet: "nope" } },
    ];
    return pick(r, pool);
  };

  it("protocol validation rejects junk without throwing", () => {
    const r = seedRng("fuzz-protocol");
    for (let i = 0; i < 2000; i++) {
      expect(() => ClientMsgZ.safeParse(junk(r))).not.toThrow();
    }
  });

  it("random actions on every board never throw, and refused ones change nothing", () => {
    for (const ruleSet of ["show", "random", ...BOARD_IDS] as const) {
      const r = seedRng(`fuzz-${ruleSet}`);
      const g: GameState = createGame({
        seed: `fuzz-${ruleSet}`,
        ruleSet,
        seats: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "c", name: "C", bot: { skill: "easy" } },
        ],
      });
      for (let i = 0; i < 1500 && !g.finished; i++) {
        const seat = pick(r, ["a", "b", "ghost"]);
        const stock = randInt(r, -2, NUM_STOCKS + 1);
        const options: Action[] = [
          { t: "trade", seat, stock, side: rand(r) < 0.5 ? "buy" : "sell", qty: randInt(r, -3, 40) },
          { t: "secret", seat, stock },
          { t: "piece", seat, kind: rand(r) < 0.5 ? "cash" : "peek", stock },
          { t: "settle" },
        ];
        const a = pick(r, options);
        const before = JSON.stringify(g);
        let res;
        expect(() => (res = applyAction(g, a))).not.toThrow();
        if (res && !(res as { ok: boolean }).ok) expect(JSON.stringify(g)).toBe(before);
        for (const s of g.seats) expect(s.cash).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
