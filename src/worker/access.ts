/**
 * Login for the MCP endpoint (NFR-MCP-8). Cloudflare Zero Trust Access protects
 * the /mcp path with Managed OAuth: an MCP client signs the user in through
 * Access, and Access forwards each allowed request with a signed JWT in the
 * `Cf-Access-Jwt-Assertion` header. This module checks that JWT (signature,
 * audience, issuer, expiry) so a request that skipped Access is refused too.
 *
 * Configuration (wrangler vars):
 *   ACCESS_TEAM_DOMAIN  https://<team>.cloudflareaccess.com
 *   ACCESS_AUD          the Access application's Audience (AUD) tag
 *   MCP_DEV_LOGIN       "1" only in local dev and tests: skip Access, sign in as a dev account
 * With neither Access nor dev login configured, every MCP request is refused.
 */

export interface Identity {
  /** Stable, non-reversible key for the account (never the email itself). */
  account: string;
}

export type AuthResult = { ok: true; identity: Identity } | { ok: false; status: 401 | 503; error: string };

const JWT_HEADER = "Cf-Access-Jwt-Assertion";
const DEV_ACCOUNT_HEADER = "x-dev-account";
const CERTS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;

let certs: { team: string; at: number; keys: Map<string, CryptoKey> } | null = null;

export async function accountKey(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`msm-account:${subject}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(req: Request, env: Env): Promise<AuthResult> {
  // Local dev and tests only (.dev.vars, wrangler.test.jsonc): wins so `npm run dev` works with Access configured.
  if (env.MCP_DEV_LOGIN === "1") {
    const name = req.headers.get(DEV_ACCOUNT_HEADER) || "dev";
    return { ok: true, identity: { account: await accountKey(`dev:${name}`) } };
  }
  const team = (env.ACCESS_TEAM_DOMAIN ?? "").replace(/\/+$/, "");
  const aud = env.ACCESS_AUD ?? "";
  if (team && aud) {
    const jwt = req.headers.get(JWT_HEADER);
    if (!jwt) return { ok: false, status: 401, error: "login_required" };
    const subject = await verify(jwt, team, aud).catch(() => null);
    if (!subject) return { ok: false, status: 401, error: "invalid_login" };
    return { ok: true, identity: { account: await accountKey(subject) } };
  }
  return { ok: false, status: 503, error: "login_not_configured" };
}

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as Record<string, unknown>;
}

async function signingKey(team: string, kid: string): Promise<CryptoKey | null> {
  const fresh = certs && certs.team === team && Date.now() - certs.at < CERTS_TTL_MS;
  if (!fresh || !certs!.keys.has(kid)) {
    const res = await fetch(`${team}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
    }
    certs = { team, at: Date.now(), keys };
  }
  return certs!.keys.get(kid) ?? null;
}

/** Returns the token's subject (user id, or service token client id) when valid, else null. */
async function verify(jwt: string, team: string, aud: string): Promise<string | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];
  const header = b64urlJson(h);
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const key = await signingKey(team, header.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const claims = b64urlJson(p);
  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return null;
  if (claims.iss !== team) return null;
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) return null;
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > now) return null;
  const subject = typeof claims.sub === "string" && claims.sub ? claims.sub : claims.common_name;
  return typeof subject === "string" && subject ? subject : null;
}
