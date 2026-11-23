import en from "./en.json";
import hu from "./hu.json";
import ko from "./ko.json";
import type { Lang } from "../lang";

/** Every UI string key. Generated from en.json, so a key missing in another catalog fails the build. */
export type MsgKey = keyof typeof en;
type Catalog = Record<MsgKey, string>;

const huCatalog: Catalog = hu;
const koCatalog: Catalog = ko;
const CATALOGS: Record<Lang, Catalog> = { en, hu: huCatalog, ko: koCatalog };

/** Keys that have plural forms (`foo_one`, `foo_other`, ...). Call them via `tp`. */
export type PluralKey = MsgKey extends infer K ? (K extends `${infer B}_other` ? B : never) : never;

export type Params = Record<string, string | number>;

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function t(lang: Lang, key: MsgKey, params?: Params): string {
  const s = CATALOGS[lang][key] ?? CATALOGS.en[key] ?? key;
  return interpolate(s, params);
}

const pluralRules = new Map<Lang, Intl.PluralRules>();

/** Plural-aware lookup: picks `key_<category>` with Intl.PluralRules, falling back to `key_other`. */
export function tp(lang: Lang, key: PluralKey, count: number, params?: Params): string {
  let pr = pluralRules.get(lang);
  if (!pr) {
    pr = new Intl.PluralRules(lang);
    pluralRules.set(lang, pr);
  }
  const cat = pr.select(count);
  const cat_ = CATALOGS[lang] as Record<string, string>;
  const s = cat_[`${key}_${cat}`] ?? cat_[`${key}_other`] ?? `${key}`;
  return interpolate(s, { count, ...params });
}

/** Does this catalog have the key? Used for codes sent by the server. */
export function hasKey(key: string): key is MsgKey {
  return key in en;
}

export function catalog(lang: Lang): Catalog {
  return CATALOGS[lang];
}
