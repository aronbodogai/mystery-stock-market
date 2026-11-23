export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** 128-bit random token, hex. */
export function newToken(): string {
  return Array.from(randomBytes(16), (x) => x.toString(16).padStart(2, "0")).join("");
}

export function newId(): string {
  return Array.from(randomBytes(6), (x) => x.toString(16).padStart(2, "0")).join("");
}

export function newRoomCode(): string {
  // 256 is a multiple of 32, so modulo keeps the distribution uniform.
  return Array.from(randomBytes(5), (x) => ROOM_ALPHABET[x % ROOM_ALPHABET.length]).join("");
}

export function newPairCode(): string {
  const b = randomBytes(4);
  const n = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export function isRoomCode(s: string): boolean {
  return s.length === 5 && [...s].every((c) => ROOM_ALPHABET.includes(c));
}

/** Constant-time string compare for tokens. */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
