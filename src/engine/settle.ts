import { PRICE_FLOOR } from "./constants";
import type { Rule, SettleCtx } from "./types";

/** Integer percent change: floor(p * (100 + d) / 100). */
export function pctChange(p: number, d: number): number {
  return Math.floor((p * (100 + d)) / 100);
}

export function clampPrice(p: number): number {
  return Math.max(PRICE_FLOOR, Math.round(p));
}

/** New price for a single non-`follow` rule. */
function applyRule(rule: Rule, i: number, ctx: SettleCtx): number {
  const p = ctx.prices[i]!;
  switch (rule.type) {
    case "cmpBuy":
      // Tie, or both zero, counts as "otherwise".
      return ctx.buyVol[i]! > ctx.buyVol[rule.a]! ? p + rule.x : p - rule.y;
    case "band": {
      const h = ctx.holdings[i]!;
      // Zero holdings are always outside the band.
      return h > 0 && h >= rule.l && h <= rule.h ? p + rule.x : p - rule.y;
    }
    case "perShare": {
      const diff = ctx.holdings[i]! - ctx.prevHoldings[i]!;
      return p - rule.p * diff;
    }
    case "breadth": {
      if (!ctx.prevMoves) return p; // no change in round 1
      const up = ctx.prevMoves.filter((m) => m > 0).length;
      const down = ctx.prevMoves.filter((m) => m < 0).length;
      if (up >= rule.k) return pctChange(p, rule.x);
      if (down >= rule.k) return pctChange(p, -rule.y);
      return p;
    }
    case "secret":
      return ctx.hiddenNext[rule.a] ? pctChange(p, rule.x) : p - rule.y;
    case "logo":
      return ctx.logo[ctx.round] ?? p;
    case "sellBuy":
      return ctx.sellVol[i]! > ctx.buyVol[i]! ? p + rule.x : p - rule.y;
    case "cheapest": {
      const min = Math.min(...ctx.prices);
      return p === min ? pctChange(p, rule.x) : p - rule.y;
    }
    case "holdRank": {
      const h = ctx.holdings[i]!;
      const max = Math.max(...ctx.holdings);
      return h > 0 && h === max ? pctChange(p, -rule.x) : p + rule.y;
    }
    case "steady":
      return p + rule.x;
    case "growth":
      return pctChange(p, rule.x);
    case "alternate":
      return ctx.round % 2 === 1 ? p + rule.x : p - rule.y;
    case "follow":
      throw new Error("follow is resolved separately");
  }
}

/**
 * Settle every stock for one round. Pure: depends only on (rules, ctx).
 * `follow` rules are evaluated last because they depend on another stock's
 * move in this same settlement.
 */
export function settle(rules: readonly Rule[], ctx: SettleCtx): number[] {
  const out: (number | undefined)[] = new Array(rules.length).fill(undefined);
  rules.forEach((rule, i) => {
    if (rule.type !== "follow") out[i] = clampPrice(applyRule(rule, i, ctx));
  });

  const resolving = new Set<number>();
  const resolve = (i: number): number => {
    const cached = out[i];
    if (cached !== undefined) return cached;
    const rule = rules[i]!;
    if (rule.type !== "follow") throw new Error("unreachable");
    const p = ctx.prices[i]!;
    resolving.add(i);
    let rose = false;
    if (!resolving.has(rule.a)) {
      rose = resolve(rule.a) > ctx.prices[rule.a]!;
    }
    resolving.delete(i);
    const v = clampPrice(rose ? pctChange(p, rule.x) : pctChange(p, -rule.y));
    out[i] = v;
    return v;
  };
  rules.forEach((_, i) => resolve(i));
  return out as number[];
}
