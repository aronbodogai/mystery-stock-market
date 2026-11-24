declare namespace Cloudflare {
  interface Env {
    ROOM: DurableObjectNamespace<import("./room").Room>;
    TV_PAIRING: DurableObjectNamespace<import("./tvPairing").TvPairing>;
    /** Per-client rate limits (see limiter.ts): rooms, TV codes and connections per minute. */
    RL_CREATE_ROOM: RateLimit;
    RL_CREATE_TV: RateLimit;
    RL_CONNECT: RateLimit;
    /** Absolute origin for QR / join URLs. Empty = use the request's origin (local dev). */
    PUBLIC_ORIGIN: string;
  }
}
interface Env extends Cloudflare.Env {}
