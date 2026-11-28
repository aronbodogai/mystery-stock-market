import { cleanName } from "../shared/names";
import { CreateRoomReqZ, PairReqZ } from "../shared/protocol";
import { PAIR_TTL_MS } from "./tvPairing";
import { allow } from "./limiter";
import { isRoomCode, json, newPairCode, newRoomCode } from "./util";

import { handleMcp } from "./mcp/server";
import { httpsRedirect, servePage } from "./pages";
import { AGENT_HEADER } from "./room";

export { Room } from "./room";
export { TvPairing } from "./tvPairing";

declare const __APP_VERSION__: string | undefined;
/** Shown by /api/health; set from package.json at build time (falls back in tests). */
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
/** The Durable Object /api/health asks. Six letters, so it can never be a real (five-letter) room code. */
const HEALTH_ROOM = "HEALTH";
declare const __DEV_SERVER__: boolean | undefined;
/** True under `vite` (dev server): no CSP, since Vite injects inline scripts. Set in vite.config.ts. */
const DEV_SERVER = typeof __DEV_SERVER__ === "boolean" ? __DEV_SERVER__ : false;

/**
 * Best-effort throttle of failed room lookups per IP (slows down code
 * guessing). Per isolate, so it is approximate; see DECISIONS.md.
 */
const FAIL_LIMIT = 30;
const FAIL_WINDOW_MS = 60_000;
const failures = new Map<string, { start: number; n: number }>();

function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? "local";
}

function throttled(ip: string): boolean {
  const f = failures.get(ip);
  return !!f && Date.now() - f.start < FAIL_WINDOW_MS && f.n >= FAIL_LIMIT;
}

function noteFailure(ip: string): void {
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || now - f.start >= FAIL_WINDOW_MS) failures.set(ip, { start: now, n: 1 });
  else f.n += 1;
  if (failures.size > 10_000) failures.clear();
}

function originOf(env: Env, url: URL): string {
  return env.PUBLIC_ORIGIN && env.PUBLIC_ORIGIN.length > 0 ? env.PUBLIC_ORIGIN : url.origin;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > 4096) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function createRoom(req: Request, env: Env, url: URL): Promise<Response> {
  const body = CreateRoomReqZ.safeParse(await readJson(req));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const name = cleanName(body.data.name);
  if (!name) return json({ error: "bad_name" }, 400);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newRoomCode();
    const created = await env.ROOM.getByName(code).init({ code, origin: originOf(env, url), hostName: name, lang: body.data.lang });
    if (created) return json({ code, ...created });
  }
  return json({ error: "try_again" }, 503);
}

async function createTv(env: Env, url: URL): Promise<Response> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const pairCode = newPairCode();
    const expiresAt = Date.now() + PAIR_TTL_MS;
    if (await env.TV_PAIRING.getByName(pairCode).init(pairCode, expiresAt)) {
      return json({ pairCode, expiresAt, origin: originOf(env, url) });
    }
  }
  return json({ error: "try_again" }, 503);
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const ip = clientIp(req);

    const toHttps = httpsRedirect(url, env.PUBLIC_ORIGIN ?? "");
    if (toHttps) return toHttps;

    // Pages and static files (everything outside /api, /ws and /mcp); see pages.ts.
    if (!path.startsWith("/api/") && !path.startsWith("/ws/") && path !== "/mcp" && env.ASSETS) {
      return servePage(req, env.ASSETS, DEV_SERVER);
    }

    // Headless play for AI agents (NFR-MCP); login through Cloudflare Access, see access.ts.
    if (path === "/mcp") return handleMcp(req, env, originOf(env, url));

    if (path === "/api/rooms" && req.method === "POST") {
      if (!(await allow(env, ip, "createRoom"))) return json({ error: "rate_limited" }, 429);
      return createRoom(req, env, url);
    }
    if (path === "/api/tv" && req.method === "POST") {
      if (!(await allow(env, ip, "createTv"))) return json({ error: "rate_limited" }, 429);
      return createTv(env, url);
    }
    // Uptime check for status.aroncreates.com (NFR-OBS-4, NFR-OPS-1): 200 when the Worker can reach a
    // Room Durable Object, 503 when it can't. Public, no auth, writes nothing, never cached.
    if (path === "/api/health" && req.method === "GET") {
      let ok = true;
      try {
        await env.ROOM.getByName(HEALTH_ROOM).info();
      } catch {
        ok = false;
      }
      return json({ ok, version: VERSION, time: Date.now() }, ok ? 200 : 503);
    }

    let m = path.match(/^\/api\/rooms\/([A-Za-z0-9]{5})$/);
    if (m && req.method === "GET") {
      if (throttled(ip)) return json({ error: "rate_limited" }, 429);
      const code = m[1]!.toUpperCase();
      const info = isRoomCode(code) ? await env.ROOM.getByName(code).info() : { exists: false, phase: null };
      if (!info.exists) noteFailure(ip);
      return json(info, info.exists ? 200 : 404);
    }

    m = path.match(/^\/api\/rooms\/([A-Za-z0-9]{5})\/export$/);
    if (m && req.method === "GET") {
      const code = m[1]!.toUpperCase();
      const hostToken = req.headers.get("x-host-token") ?? "";
      if (!isRoomCode(code) || !hostToken) return json({ error: "bad_request" }, 400);
      const res = await env.ROOM.getByName(code).exportGame(hostToken);
      if (!res.ok || !res.file) return json({ error: res.code ?? "bad_request" }, res.code === "not_host" ? 403 : 400);
      return new Response(res.file, {
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="mystery-stock-market-${code}.json"`,
        },
      });
    }

    m = path.match(/^\/api\/rooms\/([A-Za-z0-9]{5})\/pair$/);
    if (m && req.method === "POST") {
      const code = m[1]!.toUpperCase();
      const body = PairReqZ.safeParse(await readJson(req));
      if (!body.success || !isRoomCode(code)) return json({ error: "bad_request" }, 400);
      const res = await env.ROOM.getByName(code).pairWithHostToken(body.data.hostToken, body.data.pairCode);
      return json(res, res.ok ? 200 : 400);
    }

    m = path.match(/^\/ws\/room\/([A-Za-z0-9]{5})$/);
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      if (throttled(ip)) return new Response("Too many failed lookups", { status: 429 });
      if (!(await allow(env, ip, "connect"))) return new Response("Too many connections", { status: 429 });
      const code = m[1]!.toUpperCase();
      if (!isRoomCode(code)) {
        noteFailure(ip);
        return new Response("Room not found", { status: 404 });
      }
      // Only the MCP server may mark a socket as an agent's; never trust it from outside.
      const headers = new Headers(req.headers);
      headers.delete(AGENT_HEADER);
      const res = await env.ROOM.getByName(code).fetch(new Request(req, { headers }));
      if (res.status === 404) noteFailure(ip);
      return res;
    }

    m = path.match(/^\/ws\/tv\/(\d{6})$/);
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      return env.TV_PAIRING.getByName(m[1]!).fetch(req);
    }

    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
