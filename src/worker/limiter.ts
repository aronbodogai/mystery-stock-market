import { DurableObject } from "cloudflare:workers";

/**
 * Per-client rate limits that hold across isolates (NFR-SEC-7). One instance
 * per client key (a hash of the IP, never the IP itself); each bucket keeps
 * the times of recent hits in a sliding window.
 */
export class Limiter extends DurableObject<Env> {
  /** Records a hit and says whether it is within `limit` per `windowMs`. */
  async hit(bucket: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const key = `b:${bucket}`;
    const recent = ((await this.ctx.storage.get<number[]>(key)) ?? []).filter((t) => now - t < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    await this.ctx.storage.put(key, recent);
    // Forget this client once every window has passed.
    await this.ctx.storage.setAlarm(now + windowMs);
    return allowed;
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

/** Limits per client (IP). A party behind one home router shares an IP, so joins are generous. */
export const LIMITS = {
  /** Rooms created. */
  createRoom: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** TV pairing codes requested. */
  createTv: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** Room WebSocket connections (joins and reconnects). */
  connect: { limit: 120, windowMs: 60 * 1000 },
} as const;

/** Stable, non-reversible key for a client IP. */
export async function clientKey(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`msm-limiter:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function allow(env: Env, ip: string, bucket: keyof typeof LIMITS): Promise<boolean> {
  const { limit, windowMs } = LIMITS[bucket];
  return env.LIMITER.getByName(await clientKey(ip)).hit(bucket, limit, windowMs);
}
