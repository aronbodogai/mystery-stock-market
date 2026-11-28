import { describe, expect, it } from "vitest";
import { CSP, httpsRedirect, pageKind, servePage } from "../../src/worker/pages";

/** A stand-in for the ASSETS binding: real files by path, the SPA shell for everything else. */
const files: Record<string, [string, string]> = {
  "/robots.txt": ["text/plain", "User-agent: *"],
  "/og-image.png": ["image/png", "png"],
};
const assets = {
  fetch: async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const [type, body] = files[path] ?? ["text/html", "<!doctype html><div id=root></div>"];
    return new Response(body, { headers: { "content-type": type } });
  },
} as unknown as Fetcher;

const get = (path: string, dev = false) => servePage(new Request(`https://stocks.test${path}`), assets, dev);

describe("page responses (NFR-SEO-2, NFR-SEC-8)", () => {
  it("classifies client routes", () => {
    expect(pageKind("/")).toBe("home");
    for (const p of ["/r/ABCDE", "/j/abcde", "/tv", "/solo", "/pair/123456"]) expect(pageKind(p)).toBe("game");
    for (const p of ["/nope", "/r/TOOLONG", "/tv/x", "/pair/12"]) expect(pageKind(p)).toBe("other");
  });

  it("lets the home page be indexed", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBe(CSP);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("marks game pages noindex", async () => {
    const res = await get("/r/ABCDE");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("answers unknown paths with a real 404", async () => {
    const res = await get("/no-such-page");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain("root");
  });

  it("passes real files through untouched", async () => {
    const res = await get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("skips the CSP under the dev server", async () => {
    expect((await get("/", true)).headers.get("content-security-policy")).toBeNull();
  });

  it("redirects plain HTTP on the public origin only", () => {
    const res = httpsRedirect(new URL("http://stocks.test/r/ABCDE?x=1"), "https://stocks.test");
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://stocks.test/r/ABCDE?x=1");
    expect(httpsRedirect(new URL("https://stocks.test/"), "https://stocks.test")).toBeNull();
    expect(httpsRedirect(new URL("http://192.168.1.5:5173/"), "")).toBeNull();
    expect(httpsRedirect(new URL("http://192.168.1.5:5173/"), "https://stocks.test")).toBeNull();
  });
});
