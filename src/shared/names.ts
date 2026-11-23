/**
 * Display names: 1–16 characters after trimming, NFC-normalized, no control
 * characters or bidi overrides. Any script is allowed. Always rendered as text.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (/[\p{Cc}‪-‮⁦-⁩‎‏]/u.test(s)) return null;
  const len = [...s].length;
  if (len < 1 || len > 16) return null;
  return s;
}

export function sameName(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

/** Bot names. Kept international so they read in every locale. */
export const BOT_NAMES = [
  "Ada", "Bram", "Cleo", "Dario", "Edda", "Felix", "Gaia", "Hugo",
  "Iris", "Jonas", "Kira", "Leon", "Mira", "Nico", "Otto", "Pia",
];
