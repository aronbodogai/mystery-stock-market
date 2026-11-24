import { exports } from "cloudflare:workers";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import type { ServerMsg } from "../../src/shared/protocol";
import type { AgentView } from "../../src/worker/mcp/format";

const worker = (exports as unknown as { default: Fetcher }).default;

/** An MCP client that talks to this Worker in-process, signed in as `account` (dev login). */
async function connect(account = "alice"): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://stocks.test/mcp"), {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("x-dev-account", account);
      return worker.fetch(new Request(input as RequestInfo, { ...init, headers }));
    },
  });
  await client.connect(transport);
  return client;
}

type Seat = { room_code: string; token: string; view: AgentView };

/** Calls a tool in JSON mode and returns its structured result; throws with the error text on a tool error. */
async function call<T = { view: AgentView; said: string[] }>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await client.callTool({ name, arguments: { response_format: "json", ...args } });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  if (res.isError) throw new Error(text);
  expect(JSON.parse(text)).toEqual(res.structuredContent);
  return res.structuredContent as T;
}
async function callErr(client: Client, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const res = await client.callTool({ name, arguments: { response_format: "json", ...args } });
  expect(res.isError).toBe(true);
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  return text.match(/^Error \((\w+)\)/)?.[1] ?? text;
}

async function openSocket(code: string) {
  const res = await worker.fetch(`https://stocks.test/ws/room/${code}`, { headers: { Upgrade: "websocket", "x-msm-agent": "forged" } });
  const ws = res.webSocket!;
  ws.accept();
  const inbox: ServerMsg[] = [];
  ws.addEventListener("message", (e) => {
    inbox.push(JSON.parse(e.data as string));
  });
  const until = async (pred: (m: ServerMsg) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = inbox.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("timeout");
  };
  return { ws, until, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe("MCP server (NFR-MCP)", () => {
  it("lists every tool with a prefix, title, description and annotations", async () => {
    const client = await connect();
    expect(client.getServerVersion()?.name).toBe("mystery-stock-market-mcp-server");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "msm_add_bots", "msm_configure_room", "msm_create_room", "msm_end_round", "msm_get_rules", "msm_get_view",
        "msm_join_room", "msm_kick_player", "msm_new_game", "msm_place_secret", "msm_remove_bot", "msm_set_ready",
        "msm_start_game", "msm_trade", "msm_use_piece", "msm_wait_for_change",
      ].sort(),
    );
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.description!.length, t.name).toBeGreaterThan(40);
      expect(t.annotations?.readOnlyHint, t.name).toBeTypeOf("boolean");
      expect(t.annotations?.destructiveHint, t.name).toBeTypeOf("boolean");
    }
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort();
    expect(readOnly).toEqual(["msm_get_rules", "msm_get_view", "msm_wait_for_change"]);
  });

  it("refuses calls without a login (401) when Access is configured, and browser calls from other sites", async () => {
    const { authenticate } = await import("../../src/worker/access");
    const env = { ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com", ACCESS_AUD: "aud" } as Env;
    expect(await authenticate(new Request("https://x/mcp"), env)).toEqual({ ok: false, status: 401, error: "login_required" });
    const forged = new Request("https://x/mcp", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } });
    expect(await authenticate(forged, env)).toMatchObject({ ok: false, status: 401 });
    expect(await authenticate(new Request("https://x/mcp"), {} as Env)).toMatchObject({ ok: false, status: 503 });
    const cross = await worker.fetch("https://stocks.test/mcp", { method: "POST", headers: { Origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(cross.status).toBe(403);
  });

  it("an agent plays a whole game alone with bots, using only actions and waits", async () => {
    const agent = await connect("solo");
    const created = await call<Seat>(agent, "msm_create_room", { name: "Claude" });
    const seat = { room_code: created.room_code, token: created.token };
    expect(created.view.players[0]).toMatchObject({ name: "Claude", agent: true, host: true });

    await call(agent, "msm_configure_room", { ...seat, settings: { roundSeconds: 0, ruleSet: "beginning" } });
    await call(agent, "msm_add_bots", { ...seat, count: 2 });
    let view = (await call(agent, "msm_start_game", seat)).view;
    for (let i = 0; view.phase !== "trading" && i < 5; i++) {
      view = (await call<{ view: AgentView }>(agent, "msm_wait_for_change", { ...seat, version: view.version, timeout_seconds: 10 })).view;
    }
    expect(view.phase).toBe("trading");
    expect(view.stocks).toHaveLength(4);
    expect(view.me!.cash).toBe(100_000);

    const traded = await call(agent, "msm_trade", { ...seat, stock: 0, side: "buy", qty: 2 });
    expect(traded.view.me!.shares[0]).toBe(2);
    expect(traded.said[0]).toContain("2");

    // With no round limit a round ends when everyone (just the agent) is ready. That takes a few
    // seconds per round, so after two rounds of that the host ends the rest itself.
    while (view.phase !== "finished") {
      const round = view.round;
      view = (await call(agent, round <= 2 ? "msm_set_ready" : "msm_end_round", { ...seat, ...(round <= 2 ? { ready: true } : {}) })).view;
      for (let i = 0; view.phase !== "finished" && (view.round === round || view.phase !== "trading") && i < 10; i++) {
        view = (await call<{ view: AgentView }>(agent, "msm_wait_for_change", { ...seat, version: view.version, timeout_seconds: 10 })).view;
      }
    }
    expect(view.results!.ranking).toHaveLength(3);
    expect(view.results!.rules[0]!.rule.length).toBeGreaterThan(5);
  }, 120_000);

  it("returns readable Markdown by default", async () => {
    const agent = await connect("md");
    const { room_code, token } = await call<Seat>(agent, "msm_create_room", { name: "Md" });
    const res = await agent.callTool({ name: "msm_get_view", arguments: { room_code, token } });
    const text = (res.content as { text: string }[])[0]!.text;
    expect(res.structuredContent).toBeUndefined();
    expect(text).toContain(`# Room ${room_code}: lobby`);
    expect(text).toContain("Md (");
    expect(text).toContain("Next: msm_configure_room");
    const rules = await agent.callTool({ name: "msm_get_rules", arguments: { lang: "hu" } });
    expect((rules.content as { text: string }[])[0]!.text).toContain("# Játékszabály");
  });

  it("labels agents, ties seats to the account, and lets the host turn agents off", async () => {
    const host = await connect("host-account");
    const { room_code, token: hostToken } = await call<Seat>(host, "msm_create_room", { name: "Host" });
    const other = await connect("bob");
    const joined = await call<Seat>(other, "msm_join_room", { room_code, name: "Bob" });
    expect(joined.view.players.find((p) => p.name === "Bob")).toMatchObject({ agent: true, me: true });

    // Bob's seat token is useless to another account, and to a browser.
    const mallory = await connect("mallory");
    expect(await callErr(mallory, "msm_get_view", { room_code, token: joined.token })).toBe("unknown_token");
    const phone = await openSocket(room_code);
    phone.send({ type: "hello", lang: "en", token: joined.token });
    expect(await phone.until((m) => m.type === "welcome")).toMatchObject({ role: "guest" });
    phone.ws.close();

    // A person joining through the public socket is not an agent, even with a forged header.
    const human = await openSocket(room_code);
    human.send({ type: "hello", lang: "en" });
    human.send({ type: "join", name: "Human" });
    await human.until((m) => m.type === "view" && m.view.lobby.some((p) => p.name === "Human"));
    const seen = await call<AgentView>(host, "msm_get_view", { room_code, token: hostToken });
    expect(seen.players.find((p) => p.name === "Human")!.agent).toBe(false);
    human.ws.close();

    await call(host, "msm_configure_room", { room_code, token: hostToken, settings: { agents: false } });
    expect(await callErr(mallory, "msm_join_room", { room_code, name: "Mallory" })).toBe("agents_off");
  });

  it("msm_wait_for_change returns at once when the version is stale, and times out when nothing happens", async () => {
    const agent = await connect("waiter");
    const { room_code, token } = await call<Seat>(agent, "msm_create_room", { name: "Waiter" });
    const stale = await call<{ changed: boolean; view: AgentView }>(agent, "msm_wait_for_change", { room_code, token, version: "0000", timeout_seconds: 5 });
    expect(stale.changed).toBe(true);
    const quiet = await call<{ changed: boolean }>(agent, "msm_wait_for_change", { room_code, token, version: stale.view.version, timeout_seconds: 1 });
    expect(quiet.changed).toBe(false);
  });

  it("refuses bad input with an error code and a way to recover", async () => {
    const agent = await connect("errs");
    expect(await callErr(agent, "msm_get_view", { room_code: "ZZZZZ", token: "x" })).toBe("not_found");
    expect(await callErr(agent, "msm_get_view", { room_code: "bad!", token: "x" })).toBe("bad_code");
    const { room_code, token } = await call<Seat>(agent, "msm_create_room", { name: "Errs" });
    const res = await agent.callTool({ name: "msm_trade", arguments: { room_code, token, stock: 0, side: "buy", qty: 1 } });
    expect((res.content as { text: string }[])[0]!.text).toMatch(/^Error \(not_seated\): .+ join in the lobby/);
    // Unknown arguments are rejected by the schema.
    const strict = await agent.callTool({ name: "msm_get_rules", arguments: { lang: "en", extra: 1 } });
    expect(strict.isError).toBe(true);
  });
});
