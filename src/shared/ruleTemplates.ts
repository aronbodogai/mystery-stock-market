import type { Rule, RuleType } from "../engine/types";
import { STOCK_IDS } from "../engine/constants";
import { formatMoney, formatNumber, formatPercent } from "./format";
import { t, type MsgKey } from "./i18n";
import type { Lang } from "./lang";

/**
 * A rule's text is a sequence of tokens, each tagged with the reveal group
 * that uncovers it: 0 from the start, 1 at round 5, 2 at round 10, 3 at
 * round 15, 4 at round 20 (complete). Every locale has its own token order,
 * but each group carries the same information in every language.
 *
 * Template params: {self} this stock, {a} target stock, {theA} target with a
 * Hungarian article, {aSubj} target with a Korean subject particle,
 * {x} {y} {p} amounts, {l} {h} {k} counts.
 */
export type Tok = readonly [group: number, text: string];
type Templates = Record<RuleType, readonly Tok[]>;

const EN: Templates = {
  cmpBuy: [[0, "If"], [1, "this stock's buy volume"], [2, "beats {a}'s"], [0, "this round:"], [3, "+{x}."], [0, "Otherwise:"], [4, "−{y}."]],
  band: [[0, "If"], [1, "total holdings of this stock"], [0, "end the round"], [2, "between {l} and {h} shares:"], [3, "+{x}."], [0, "Otherwise:"], [4, "−{y}."]],
  perShare: [[0, "For every share that"], [1, "total holdings"], [2, "rise"], [0, "this round:"], [3, "−{p}."], [0, "For every share they"], [2, "fall:"], [4, "+{p}."]],
  follow: [[0, "If"], [2, "{a}"], [1, "rises in the same settlement:"], [3, "+{x}."], [0, "Otherwise:"], [4, "−{y}."]],
  breadth: [[0, "If"], [2, "{k} or more"], [1, "stocks rose in the previous settlement:"], [3, "+{x}."], [0, "If"], [2, "{k} or more"], [1, "fell:"], [4, "−{y}."], [0, "Otherwise: no change."]],
  secret: [[0, "If"], [2, "{a}"], [1, "will be hidden by a secret next round:"], [3, "+{x}."], [0, "Otherwise:"], [4, "−{y}."]],
  logo: [[0, "The price"], [1, "follows a fixed path"], [2, "that is drawn"], [3, "on every screen:"], [4, "it is the game's logo."]],
  sellBuy: [[0, "If"], [1, "this stock's sell volume"], [2, "beats its buy volume"], [0, "this round:"], [3, "+{x}."], [0, "Otherwise:"], [4, "−{y}."]],
  cheapest: [[0, "If"], [1, "this stock's price"], [2, "is the lowest on the board (ties count)"], [0, "before settlement:"], [3, "+{x}."], [0, "Otherwise:"], [4, "−{y}."]],
  holdRank: [[0, "If"], [1, "this stock's total holdings"], [2, "are the highest on the board (ties count)"], [0, "at the end of the round:"], [3, "−{x}."], [0, "Otherwise:"], [4, "+{y}."]],
};

const HU: Templates = {
  cmpBuy: [[0, "Ha"], [1, "ennek a részvénynek a vételi volumene"], [0, "ebben a körben"], [2, "meghaladja {theA} vételi volumenét:"], [3, "+{x}."], [0, "Különben:"], [4, "−{y}."]],
  band: [[0, "Ha"], [1, "ennek a részvénynek az összes állománya"], [0, "a kör végén"], [2, "{l} és {h} darab között van:"], [3, "+{x}."], [0, "Különben:"], [4, "−{y}."]],
  perShare: [[0, "Minden darab után, amennyivel"], [1, "az összes állomány"], [0, "ebben a körben"], [2, "nő:"], [3, "−{p}."], [0, "Minden darab után, amennyivel"], [2, "csökken:"], [4, "+{p}."]],
  follow: [[0, "Ha"], [2, "{theA}"], [1, "ugyanabban az elszámolásban emelkedik:"], [3, "+{x}."], [0, "Különben:"], [4, "−{y}."]],
  breadth: [[0, "Ha az előző elszámolásban"], [2, "legalább {k}"], [1, "részvény emelkedett:"], [3, "+{x}."], [0, "Ha"], [2, "legalább {k}"], [1, "esett:"], [4, "−{y}."], [0, "Különben nincs változás."]],
  secret: [[0, "Ha"], [2, "{theA}"], [1, "a következő körben el lesz rejtve:"], [3, "+{x}."], [0, "Különben:"], [4, "−{y}."]],
  logo: [[0, "Az árfolyam"], [1, "rögzített pályát követ,"], [2, "amely ki van rajzolva"], [3, "minden képernyőn:"], [4, "ez a játék logója."]],
  sellBuy: [[0, "Ha"], [1, "ennek a részvénynek az eladási volumene"], [0, "ebben a körben"], [2, "meghaladja a saját vételi volumenét:"], [3, "+{x}."], [0, "Különben:"], [4, "−{y}."]],
  cheapest: [[0, "Ha"], [1, "ennek a részvénynek az ára"], [0, "elszámolás előtt"], [2, "a legalacsonyabb a táblán (holtverseny is számít):"], [3, "+{x}."], [0, "Különben:"], [4, "−{y}."]],
  holdRank: [[0, "Ha"], [1, "ennek a részvénynek az összes állománya"], [0, "a kör végén"], [2, "a legnagyobb a táblán (holtverseny is számít):"], [3, "−{x}."], [0, "Különben:"], [4, "+{y}."]],
};

const KO: Templates = {
  cmpBuy: [[0, "이번 라운드에"], [1, "이 종목의 매수량이"], [2, "{a}의 매수량보다 많으면:"], [3, "+{x}."], [0, "아니면:"], [4, "−{y}."]],
  band: [[0, "라운드 종료 시"], [1, "이 종목의 총 보유량이"], [2, "{l}~{h}주 사이이면:"], [3, "+{x}."], [0, "아니면:"], [4, "−{y}."]],
  perShare: [[0, "이번 라운드에"], [1, "총 보유량이"], [0, "1주"], [2, "늘 때마다:"], [3, "−{p}."], [0, "1주"], [2, "줄 때마다:"], [4, "+{p}."]],
  follow: [[0, "같은 정산에서"], [2, "{aSubj}"], [1, "오르면:"], [3, "+{x}."], [0, "아니면:"], [4, "−{y}."]],
  breadth: [[0, "직전 정산에서"], [2, "{k}개 이상의"], [1, "종목이 올랐으면:"], [3, "+{x}."], [2, "{k}개 이상이"], [1, "내렸으면:"], [4, "−{y}."], [0, "그 외에는 변동 없음."]],
  secret: [[0, "다음 라운드에"], [2, "{aSubj}"], [1, "비밀로 가려지면:"], [3, "+{x}."], [0, "아니면:"], [4, "−{y}."]],
  logo: [[0, "주가는"], [1, "정해진 경로를 따른다."], [2, "그 경로는"], [3, "모든 화면에 그려져 있다:"], [4, "바로 게임 로고다."]],
  sellBuy: [[0, "이번 라운드에"], [1, "이 종목의 매도량이"], [2, "자신의 매수량보다 많으면:"], [3, "+{x}."], [0, "아니면:"], [4, "−{y}."]],
  cheapest: [[0, "정산 전"], [1, "이 종목의 주가가"], [2, "보드에서 가장 낮으면(동률 포함):"], [3, "+{x}."], [0, "아니면:"], [4, "−{y}."]],
  holdRank: [[0, "라운드 종료 시"], [1, "이 종목의 총 보유량이"], [2, "보드에서 가장 많으면(동률 포함):"], [3, "−{x}."], [0, "아니면:"], [4, "+{y}."]],
};

export const RULE_TEMPLATES: Record<Lang, Templates> = { en: EN, hu: HU, ko: KO };

export function stockName(i: number, lang: Lang): string {
  return t(lang, `stock.${STOCK_IDS[i]}` as MsgKey);
}

/** Hungarian definite article: "az" before a vowel sound, "a" otherwise. */
function huArticle(name: string): string {
  return /^[aeiouáéíóöőúüű]/i.test(name) ? `az ${name}` : `a ${name}`;
}

/** Korean subject particle 이/가 chosen by the final syllable's batchim. */
function koSubject(name: string): string {
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) return name + ((last - 0xac00) % 28 === 0 ? "가" : "이");
  return `${name}이(가)`;
}

type ParamKind = "money" | "pct" | "int";
const KINDS: Record<RuleType, Partial<Record<"x" | "y" | "p", ParamKind>>> = {
  cmpBuy: { x: "money", y: "money" },
  band: { x: "money", y: "money" },
  perShare: { p: "money" },
  follow: { x: "pct", y: "pct" },
  breadth: { x: "pct", y: "pct" },
  secret: { x: "pct", y: "money" },
  logo: {},
  sellBuy: { x: "money", y: "money" },
  cheapest: { x: "pct", y: "money" },
  holdRank: { x: "pct", y: "money" },
};

function fmt(kind: ParamKind | undefined, v: number, lang: Lang): string {
  if (kind === "money") return formatMoney(v, lang);
  if (kind === "pct") return formatPercent(v, lang);
  return formatNumber(v, lang);
}

export interface RenderedToken {
  g: number;
  text: string;
}

/** Render a rule's tokens in one language. Never sent as-is: projections redact hidden groups. */
export function renderRule(rule: Rule, self: number, lang: Lang): RenderedToken[] {
  const params: Record<string, string> = { self: stockName(self, lang) };
  const r = rule as Record<string, unknown>;
  if (typeof r.a === "number") {
    const a = stockName(r.a, lang);
    params.a = a;
    params.theA = lang === "hu" ? huArticle(a) : a;
    params.aSubj = lang === "ko" ? koSubject(a) : a;
  }
  for (const key of ["x", "y", "p"] as const) {
    if (typeof r[key] === "number") params[key] = fmt(KINDS[rule.type][key], r[key] as number, lang);
  }
  for (const key of ["l", "h", "k"] as const) {
    if (typeof r[key] === "number") params[key] = formatNumber(r[key] as number, lang);
  }
  return RULE_TEMPLATES[lang][rule.type].map(([g, s]) => ({
    g,
    text: s.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m),
  }));
}
