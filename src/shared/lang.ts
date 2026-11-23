export const LANGS = ["en", "hu", "ko"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

/** Pick a launch locale from a BCP 47 tag such as navigator.language. */
export function pickLang(tag: string | undefined | null): Lang {
  const base = (tag ?? "").toLowerCase().split("-")[0];
  return isLang(base) ? base : "en";
}
