/**
 * Page responses: the SPA shell and static files, served through the ASSETS
 * binding so the Worker can add headers (NFR-SEO-2, NFR-SEC-8).
 *
 * - `/` is the only page meant for search engines.
 * - Game pages (rooms, joins, TV, pairing, solo) are sent with `noindex`.
 * - Any other path that would fall back to the SPA shell gets a real 404
 *   (the shell is still the body, so the client sends the visitor home).
 * - Real files (JS, CSS, audio, robots.txt …) pass through untouched.
 */

/** Client routes from src/client/main.tsx, minus `/`. Keep the two in step. */
const GAME_PAGE = /^\/(?:r\/[A-Za-z0-9]{5}|j\/[A-Za-z0-9]{5}|pair\/\d{6}|tv|solo)\/?$/;

/** Sent with every HTML page in production. Fonts come from Google Fonts and Fontshare (DECISIONS.md). */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React writes style attributes, so inline styles must stay allowed.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdn.fontshare.com",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

export type PageKind = "home" | "game" | "other";

export function pageKind(path: string): PageKind {
  if (path === "/" || path === "/index.html") return "home";
  return GAME_PAGE.test(path) ? "game" : "other";
}

const isHtml = (res: Response) => (res.headers.get("content-type") ?? "").startsWith("text/html");

/**
 * Serve a non-API request from the static assets. `dev` turns off the CSP
 * (Vite's dev server injects inline scripts).
 */
export async function servePage(req: Request, assets: Fetcher, dev: boolean): Promise<Response> {
  const url = new URL(req.url);
  const res = await assets.fetch(req);
  if (!isHtml(res)) return res;

  const kind = pageKind(url.pathname);
  const status = kind === "other" && res.status === 200 ? 404 : res.status;
  const headers = new Headers(res.headers);
  if (kind !== "home") headers.set("X-Robots-Tag", "noindex");
  if (!dev) headers.set("Content-Security-Policy", CSP);
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, { status, statusText: status === 404 ? "Not Found" : res.statusText, headers });
}

/**
 * Plain-HTTP requests for the public origin go to HTTPS. LAN play in local dev
 * (no public origin, or a different host) stays on HTTP.
 */
export function httpsRedirect(url: URL, publicOrigin: string): Response | null {
  if (url.protocol !== "http:" || !publicOrigin.startsWith("https://")) return null;
  if (url.host !== new URL(publicOrigin).host) return null;
  return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
}
