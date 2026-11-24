/**
 * Per-client rate limits (NFR-SEC-7), using Cloudflare's built-in Rate Limiting
 * bindings (see `ratelimits` in wrangler.jsonc). Windows are one minute; counts
 * are approximate and kept per Cloudflare location, which is enough to stop
 * scripted spam. The key is a hash of the client IP, never the IP itself.
 *
 * A whole party behind one home router shares an IP, so connections are generous.
 */
export const LIMITS = {
  /** Rooms created per minute (binding RL_CREATE_ROOM). */
  createRoom: "RL_CREATE_ROOM",
  /** TV pairing codes requested per minute (binding RL_CREATE_TV). */
  createTv: "RL_CREATE_TV",
  /** Room WebSocket connections, joins and reconnects, per minute (binding RL_CONNECT). */
  connect: "RL_CONNECT",
} as const satisfies Record<string, keyof Env>;

/** Stable, non-reversible key for a client IP. */
export async function clientKey(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`msm-limiter:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function allow(env: Env, ip: string, bucket: keyof typeof LIMITS): Promise<boolean> {
  const { success } = await env[LIMITS[bucket]].limit({ key: await clientKey(ip) });
  return success;
}
