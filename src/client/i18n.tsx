import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatMoney, formatNumber, formatPercent, type MoneyOptions } from "../shared/format";
import {
  hasKey,
  t as translate,
  tp as translatePlural,
  type MsgKey,
  type Params,
  type PluralKey,
} from "../shared/i18n";
import { isLang, pickLang, type Lang } from "../shared/lang";
import { stockName } from "../shared/ruleTemplates";
import { load, save } from "./storage";

export type UpDown = "kr" | "west";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MsgKey, params?: Params) => string;
  tp: (key: PluralKey, n: number, params?: Params) => string;
  /** Translate a server code (error/toast/event) with a fallback. */
  code: (prefix: "err" | "toast" | "ev", code: string, params?: Params) => string;
  money: (n: number, opts?: MoneyOptions) => string;
  num: (n: number) => string;
  pct: (n: number, sign?: boolean) => string;
  /** Company name for a board slot. */
  stock: (i: number) => string;
  /** Company (index into STOCK_IDS) on a board slot; identity outside a game. */
  company: (slot: number) => number;
  upDown: UpDown;
  setUpDown: (u: UpDown) => void;
  /** Language pinned for this screen (game language / TV): switchers hide themselves. */
  locked: boolean;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  const saved = load<string | null>("msm:lang", null);
  if (isLang(saved)) return saved;
  return pickLang(typeof navigator !== "undefined" ? navigator.language : "en");
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [upDown, setUpDownState] = useState<UpDown>(() =>
    load<string>("msm:updown", "kr") === "west" ? "west" : "kr",
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.updown = upDown;
  }, [upDown]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    save("msm:lang", l);
  }, []);
  const setUpDown = useCallback((u: UpDown) => {
    setUpDownState(u);
    save("msm:updown", u);
  }, []);

  const value = useMemo(() => buildI18n(lang, setLang, upDown, setUpDown), [lang, setLang, upDown, setUpDown]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function buildI18n(
  lang: Lang,
  setLang: (l: Lang) => void,
  upDown: UpDown,
  setUpDown: (u: UpDown) => void,
  locked = false,
  companies: readonly number[] | null = null,
): I18n {
  const t = (key: MsgKey, params?: Params) => translate(lang, key, params);
  const company = (slot: number) => companies?.[slot] ?? slot;
  return {
    lang,
    setLang,
    t,
    tp: (key, n, params) => translatePlural(lang, key, n, { ...params, n: formatNumber(n, lang) }),
    code: (prefix, code, params) => {
      const key = `${prefix}.${code}`;
      const p: Params = { ...params };
      if (typeof p.stock === "number") p.stock = stockName(company(p.stock), lang);
      if (typeof p.side === "string") p.side = translate(lang, p.side === "buy" ? "trade.bought" : "trade.sold");
      if (typeof p.qty === "number") p.qty = formatNumber(p.qty, lang);
      return hasKey(key) ? translate(lang, key, p) : translate(lang, `${prefix}.unknown` as MsgKey, { code });
    },
    money: (n, opts) => formatMoney(n, lang, opts),
    num: (n) => formatNumber(n, lang),
    pct: (n, sign) => formatPercent(n, lang, sign),
    stock: (i) => stockName(company(i), lang),
    company,
    upDown,
    setUpDown,
    locked,
  };
}

/**
 * Pins a subtree to one language, ignoring the device setting (the TV is always English),
 * and/or to a game's board: `companies[slot]` decides which company name and logo a stock slot shows.
 */
export function FixedLang({
  lang,
  companies = null,
  children,
}: {
  lang: Lang | null;
  companies?: readonly number[] | null;
  children: ReactNode;
}) {
  const parent = useI18n();
  const boardKey = companies ? companies.join(",") : "";
  // null = not pinned: pass the device setting through (keeps the tree shape stable, so no remounts).
  const value = useMemo(() => {
    if (!lang && !boardKey) return parent;
    const board = boardKey ? boardKey.split(",").map(Number) : null;
    return lang
      ? buildI18n(lang, () => undefined, parent.upDown, parent.setUpDown, true, board)
      : buildI18n(parent.lang, parent.setLang, parent.upDown, parent.setUpDown, parent.locked, board);
  }, [lang, parent, boardKey]);
  useEffect(() => {
    if (!lang) return;
    const prev = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = prev;
    };
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}
