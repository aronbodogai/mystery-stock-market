import { exports } from "cloudflare:workers";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import type { ServerMsg } from "../../src/shared/protocol";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Json> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  const data = JSON.parse(text);
  if (res.isError) throw Object.assign(new Error(data.error), { data });
  return data;
}
const callErr = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  try {
    await call(client, name, args);
  } catch (e) {
    return (e as { data: { error: string } }).data.error;
  }
  throw new Error(`${name} did not fail`);
};

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
  return { ws, inbox, until, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe("MCP server (NFR-MCP)", () => {
  it("lists every game tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "add_bot", "configure", "create_room", "end_round", "get_view", "how_to_play", "join_room", "kick",
        "new_game", "place_secret", "remove_bot", "set_ready", "start_game", "trade", "use_piece", "wait_for_change",
      ].sort(),
    );
  });

  it("refuses calls without a login (401) when Access is configured", async () => {
    // The test config uses dev login; production sets ACCESS_*. A forged JWT must not pass either path's check.
    const { authenticate } = await import("../../src/worker/access");
    const env = { ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com", ACCESS_AUD: "aud" } as Env;
    expect(await authenticate(new Request("https://x/mcp"), env)).toEqual({ ok: false, status: 401, error: "login_required" });
    const forged = new Request("https://x/mcp", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } });
    expect(await authenticate(forged, env)).toMatchObject({ ok: false, status: 401 });
    expect(await authenticate(new Request("https://x/mcp"), {} as Env)).toMatchObject({ ok: false, status: 503 });
  });

  it("an agent plays a whole game alone with bots, using only actions and waits", async () => {
    const agent = await connect("solo");
    const created = await call(agent, "create_room", { name: "Claude" });
    const { room, token } = created;
    expect(created.view.players[0]).toMatchObject({ name: "Claude", agent: true, host: true });

    await call(agent, "configure", { room, token, config: { roundSeconds: 0, ruleSet: "beginning" } });
    await call(agent, "add_bot", { room, token, count: 2 });
    let view = (await call(agent, "start_game", { room, token })).view;
    expect(view.phase === "countdown" || view.phase === "trading").toBe(true);

    // Countdown: wait until trading opens.
    for (let i = 0; view.phase !== "trading" && i < 5; i++) view = (await call(agent, "wait_for_change", { room, token, version: view.version, timeoutSeconds: 10 })).view;
    expect(view.phase).toBe("trading");
    expect(view.stocks).toHaveLength(4);
    expect(view.me.cash).toBe(100_000);

    const traded = await call(agent, "trade", { room, token, stock: 0, side: "buy", qty: 2 });
    expect(traded.view.me.shares[0]).toBe(2);
    expect(traded.said[0]).toContain("2");

    // With no round limit a round ends when everyone (just the agent) is ready. That takes a few
    // seconds per round, so after two rounds of that the host ends the rest itself.
    while (view.phase !== "finished") {
      const round = view.round;
      view = (await call(agent, round <= 2 ? "set_ready" : "end_round", { room, token, ...(round <= 2 ? { ready: true } : {}) })).view;
      for (let i = 0; view.phase !== "finished" && (view.round === round || view.phase !== "trading") && i < 10; i++) {
        view = (await call(agent, "wait_for_change", { room, token, version: view.version, timeoutSeconds: 10 })).view;
      }
    }
    expect(view.results.ranking).toHaveLength(3);
    expect(view.results.rules[0].rule.length).toBeGreaterThan(5);
  }, 120_000);

  it("labels agents, ties seats to the account, and lets the host turn agents off", async () => {
    const host = await connect("host-account");
    const { room, token: hostToken } = await call(host, "create_room", { name: "Host" });
    const other = await connect("bob");
    const joined = await call(other, "join_room", { room, name: "Bob" });
    expect(joined.view.players.find((p: Json) => p.name === "Bob")).toMatchObject({ agent: true, me: true });

    // Bob's seat token is useless to another account, and to a browser.
    const mallory = await connect("mallory");
    expect(await callErr(mallory, "get_view", { room, token: joined.token })).toBe("unknown_token");
    const phone = await openSocket(room);
    phone.send({ type: "hello", lang: "en", token: joined.token });
    const welcome = await phone.until((m) => m.type === "welcome");
    expect(welcome).toMatchObject({ role: "guest" });
    phone.ws.close();

    // A human joining through the public socket is not an agent, even with a forged header.
    const human = await openSocket(room);
    human.send({ type: "hello", lang: "en" });
    human.send({ type: "join", name: "Human" });
    await human.until((m) => m.type === "view" && m.view.lobby.some((p) => p.name === "Human"));
    const humanView = (await call(host, "get_view", { room, token: hostToken })).players.find((p: Json) => p.name === "Human");
    expect(humanView.agent).toBe(false);
    human.ws.close();

    await call(host, "configure", { room, token: hostToken, config: { agents: false } });
    expect(await callErr(mallory, "join_room", { room, name: "Mallory" })).toBe("agents_off");
  });

  it("wait_for_change returns at once when the version is stale, and times out when nothing happens", async () => {
    const agent = await connect("waiter");
    const { room, token } = await call(agent, "create_room", { name: "Waiter" });
    const stale = await call(agent, "wait_for_change", { room, token, version: "0000", timeoutSeconds: 5 });
    expect(stale.changed).toBe(true);
    const quiet = await call(agent, "wait_for_change", { room, token, version: stale.view.version, timeoutSeconds: 1 });
    expect(quiet.changed).toBe(false);
  });

  it("refuses bad input with an error code and text", async () => {
    const agent = await connect("errs");
    expect(await callErr(agent, "get_view", { room: "ZZZZZ", token: "x" })).toBe("not_found");
    expect(await callErr(agent, "get_view", { room: "bad!", token: "x" })).toBe("bad_code");
    const { room, token } = await call(agent, "create_room", { name: "Errs" });
    expect(await callErr(agent, "trade", { room, token, stock: 0, side: "buy", qty: 1 })).toBe("not_seated");
  });
});
