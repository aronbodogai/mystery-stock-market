declare namespace Cloudflare {
  interface Env {
    ROOM: DurableObjectNamespace<import("./room").Room>;
    TV_PAIRING: DurableObjectNamespace<import("./tvPairing").TvPairing>;
    /** Per-client rate limits (room and TV creation, connections). */
    LIMITER: DurableObjectNamespace<import("./limiter").Limiter>;
    /** Absolute origin for QR / join URLs. Empty = use the request's origin (local dev). */
    PUBLIC_ORIGIN: string;
  }
}
interface Env extends Cloudflare.Env {}
