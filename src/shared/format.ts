import { CURRENCY } from "./currency";
import { t } from "./i18n";
import type { Lang } from "./lang";

const MINUS = "−"; // −

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, opts: Intl.NumberFormatOptions, tag: string): Intl.NumberFormat {
  const k = `${lang}|${tag}`;
  let f = numberFormats.get(k);
  if (!f) {
    f = new Intl.NumberFormat(lang, opts);
    numberFormats.set(k, f);
  }
  return f;
}

export function formatNumber(n: number, lang: Lang): string {
  const s = nf(lang, { maximumFractionDigits: 0 }, "int").format(Math.abs(n));
  return n < 0 ? MINUS + s : s;
}

export interface MoneyOptions {
  /** Compact form for tight spaces, e.g. ℳ1.5M. */
  compact?: boolean;
  /** Show "+" on positive values (deltas). */
  sign?: boolean;
}

/**
 * Format whole marks. Intl currency formatting only accepts real ISO codes, so
 * the number is formatted with Intl and the symbol is placed with the
 * per-locale `currency.pattern` from the catalog.
 */
export function formatMoney(amount: number, lang: Lang, opts: MoneyOptions = {}): string {
  const abs = Math.abs(Math.round(amount));
  const num = opts.compact
    ? nf(lang, { notation: "compact", maximumFractionDigits: 1 }, "compact").format(abs)
    : nf(lang, { maximumFractionDigits: 0 }, "int").format(abs);
  const body = t(lang, "currency.pattern", { symbol: CURRENCY.symbol, amount: num });
  const sign = amount < 0 ? MINUS : opts.sign && amount > 0 ? "+" : "";
  return sign + body;
}

/** Whole-number percent, e.g. 13 -> "13%" (or "+13%" with sign). */
export function formatPercent(pct: number, lang: Lang, sign = false): string {
  const s = nf(lang, { style: "percent", maximumFractionDigits: 0 }, "pct").format(Math.abs(pct) / 100);
  const prefix = pct < 0 ? MINUS : sign && pct > 0 ? "+" : "";
  return prefix + s;
}
