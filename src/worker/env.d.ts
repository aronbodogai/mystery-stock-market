declare namespace Cloudflare {
  interface Env {
    ROOM: DurableObjectNamespace<import("./room").Room>;
    TV_PAIRING: DurableObjectNamespace<import("./tvPairing").TvPairing>;
    /** Per-client rate limits (see limiter.ts): rooms, TV codes and connections per minute. */
    RL_CREATE_ROOM: RateLimit;
    RL_CREATE_TV: RateLimit;
    RL_CONNECT: RateLimit;
    /** Static files and the SPA shell (wrangler.jsonc `assets`); absent in the Durable Object tests. */
    ASSETS?: Fetcher;
    /** Absolute origin for QR / join URLs. Empty = use the request's origin (local dev). */
    PUBLIC_ORIGIN: string;
    /** Cloudflare Access login for /mcp (see access.ts). Both empty = MCP refused unless MCP_DEV_LOGIN. */
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    /** "1" in local dev and tests only: MCP without Access. */
    MCP_DEV_LOGIN?: string;
  }
}
interface Env extends Cloudflare.Env {}
