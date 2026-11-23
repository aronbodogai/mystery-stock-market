/**
 * Seeded PRNG (sfc32, seeded with cyrb128). The state is a plain 4-tuple of
 * uint32s so it can live inside the JSON game state and be persisted.
 * Every random decision in a game draws from that one state, which makes a
 * game replay exactly from (seed, action log).
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: string): RngState {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const s: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  // Warm up so similar seeds diverge.
  for (let i = 0; i < 12; i++) rand(s);
  return s;
}

/** Returns a float in [0, 1) and advances `s` in place. */
export function rand(s: RngState): number {
  let a = s[0] | 0,
    b = s[1] | 0,
    c = s[2] | 0,
    d = s[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return (t >>> 0) / 4294967296;
}

/** Integer in [min, max], inclusive. */
export function randInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1));
}

/** Integer in [min, max] that is a multiple of `step`. */
export function randStep(s: RngState, min: number, max: number, step: number): number {
  return randInt(s, Math.ceil(min / step), Math.floor(max / step)) * step;
}

export function chance(s: RngState, p: number): boolean {
  return rand(s) < p;
}

export function pick<T>(s: RngState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length)]!;
}

export function shuffle<T>(s: RngState, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** A random seed string for when the host leaves the seed empty. */
export function randomSeed(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
