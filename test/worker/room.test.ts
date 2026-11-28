import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Room } from "../../src/worker/room";
import type { RoomState } from "../../src/engine";
import { replay } from "../../src/engine";
import type { ServerMsg, View } from "../../src/shared/protocol";

const worker = (exports as unknown as { default: Fetcher }).default;

/** A test WebSocket client with an inbox you can await. */
class Client {
  inbox: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  constructor(public ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data as string) as ServerMsg;
      const w = this.waiters.findIndex((x) => x.pred(msg));
      if (w >= 0) {
        const [hit] = this.waiters.splice(w, 1);
        hit!.resolve(msg);
      } else this.inbox.push(msg);
    });
  }
  static async open(path: string): Promise<Client> {
    const res = await worker.fetch(`https://stocks.test${path}`, { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    return new Client(ws);
  }
  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }
  next<T extends ServerMsg["type"]>(type: T, pred: (m: Extract<ServerMsg, { type: T }>) => boolean = () => true) {
    const match = (m: ServerMsg) => m.type === type && pred(m as Extract<ServerMsg, { type: T }>);
    const idx = this.inbox.findIndex(match);
    if (idx >= 0) return Promise.resolve(this.inbox.splice(idx, 1)[0] as Extract<ServerMsg, { type: T }>);
    return new Promise<Extract<ServerMsg, { type: T }>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}; inbox=${JSON.stringify(this.inbox.map((m) => m.type === "view" ? "view:r" + m.view.round + ":" + m.view.phase : m.type === "error" || m.type === "toast" ? m.type + ":" + m.code : m.type))}`)), 5000);
      this.waiters.push({
        pred: match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMsg, { type: T }>);
        },
      });
    });
  }
  /** Latest view matching the predicate (drains older ones). */
  async view(pred: (v: View) => boolean = () => true): Promise<View> {
    for (;;) {
      const m = await this.next("view");
      if (pred(m.view)) return m.view;
    }
  }
  close() {
    this.ws.close(1000, "bye");
  }
}

let ipSeq = 0;
/** Each test room comes from its own client IP, so the per-IP creation limit never trips other tests. */
async function createRoom(name = "Host", ip = `10.0.0.${++ipSeq}`) {
  const res = await worker.fetch("https://stocks.test/api/rooms", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip },
    body: JSON.stringify({ name, lang: "en" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { code: string; hostToken: string; playerId: string; playerToken: string };
}

const stubFor = (code: string) => env.ROOM.getByName(code);

describe("Room Durable Object", () => {
  it("create → join → start → trade → settle via alarm → reconnect → finish → cleanup", async () => {
    const room = await createRoom("Ana");
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);

    const host = await Client.open(`/ws/room/${room.code}`);
    host.send({ type: "hello", token: room.playerToken, hostToken: room.hostToken, lang: "en" });
    const welcome = await host.next("welcome");
    expect(welcome.role).toBe("host");
    let hv = await host.view();
    expect(hv.phase).toBe("lobby");
    expect(hv.origin).toBe("https://stocks.test");

    const p = await Client.open(`/ws/room/${room.code}`);
    p.send({ type: "hello", lang: "hu" });
    expect((await p.next("welcome")).role).toBe("guest");
    p.send({ type: "join", name: "ana" });
    expect((await p.next("error")).code).toBe("name_taken");
    p.send({ type: "join", name: "Ben" });
    const pw = await p.next("welcome");
    expect(pw.role).toBe("player");
    expect(pw.token).toMatch(/^[0-9a-f]{32}$/);
    const benToken = pw.token!;

    host.send({ type: "addBot" });
    hv = await host.view((v) => v.lobby.length === 3);
    expect(hv.lobby.filter((x) => x.bot).length).toBe(1);

    host.send({ type: "start" });
    hv = await host.view((v) => v.phase === "countdown");
    expect(hv.countdownEnd).toBeGreaterThan(Date.now() - 1000);

    // A late joiner becomes a spectator once the game has started.
    const late = await Client.open(`/ws/room/${room.code}`);
    late.send({ type: "hello", lang: "en" });
    expect((await late.next("welcome")).role).toBe("spectator");
    late.send({ type: "join", name: "Late" });
    expect((await late.next("error")).code).toBe("game_started");

    // Countdown ends via the alarm.
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      const r = (inst as unknown as { room: RoomState }).room;
      r.countdownEnd = Date.now() - 1;
    });
    expect(await runDurableObjectAlarm(stubFor(room.code))).toBe(true);
    hv = await host.view((v) => v.phase === "trading");
    expect(hv.round).toBe(1);
    expect(hv.deadline).toBeGreaterThan(Date.now());

    // Trade, with idempotent seq.
    p.send({ type: "trade", stock: 1, side: "buy", qty: 3, seq: 1 });
    expect((await p.next("toast")).code).toBe("trade_ok");
    const patch = await p.next("patch");
    expect(patch.me.shares[1]).toBe(3);
    expect(patch.me.cash).toBe(70_000);
    p.send({ type: "trade", stock: 1, side: "buy", qty: 3, seq: 1 }); // resend: ignored
    const patch2 = await p.next("patch");
    expect(patch2.me.shares[1]).toBe(3);
    p.send({ type: "trade", stock: 1, side: "buy", qty: 100, seq: 2 });
    expect((await p.next("error")).code).toBe("insufficient_cash");

    // Round settles when the deadline alarm fires.
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.deadline = Date.now() - 1;
    });
    expect(await runDurableObjectAlarm(stubFor(room.code))).toBe(true);
    const settled = await host.next("settled");
    expect(settled.round).toBe(1);
    hv = await host.view((v) => v.round === 2);
    expect(hv.stocks[1]!.last).toEqual({ buy: expect.any(Number), sell: expect.any(Number), hold: expect.any(Number) });

    // Reconnect with the token resumes the same seat.
    p.close();
    const p2 = await Client.open(`/ws/room/${room.code}`);
    p2.send({ type: "hello", token: benToken, lang: "en" });
    expect((await p2.next("welcome")).playerId).toBe(pw.playerId);
    const pv = await p2.view();
    expect(pv.me?.shares[1]).toBe(3);
    expect(pv.round).toBe(2);

    // Survives eviction (deploy / hibernation): state comes back from storage.
    await evictDurableObject(stubFor(room.code));
    p2.send({ type: "ready", value: false });
    const afterEvict = await p2.view();
    expect(afterEvict.round).toBe(2);
    expect(afterEvict.me?.shares[1]).toBe(3);

    // Host ends rounds until the game finishes.
    for (let r = 2; r <= 24; r++) {
      await new Promise((res) => setTimeout(res, 60)); // stay under the 20 msg/s socket limit
      host.send({ type: "endRound" });
      await host.next("settled", (m) => m.round === r);
    }
    hv = await host.view((v) => v.phase === "finished");
    expect(hv.results?.ranking.length).toBe(3);
    expect(hv.results?.seed.length).toBeGreaterThan(0);

    // The persisted action log replays to the same final game.
    const { state, log } = await runInDurableObject(stubFor(room.code), async (inst: Room) => {
      const r = (inst as unknown as { room: RoomState }).room;
      return { state: r, log: await inst.actionLog() };
    });
    expect(replay(state.gameInit!, log)).toEqual(state.game);

    // Cleanup alarm 1h after finishing deletes everything.
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.finishedAt = Date.now() - 2 * 60 * 60 * 1000;
    });
    expect(await runDurableObjectAlarm(stubFor(room.code))).toBe(true);
    expect(await stubFor(room.code).info()).toEqual({ exists: false, phase: null });
    host.close();
    p2.close();
    late.close();
  });

  it("end early when everyone is ready, cancellable by un-readying", async () => {
    const room = await createRoom("Host");
    const host = await Client.open(`/ws/room/${room.code}`);
    host.send({ type: "hello", token: room.playerToken, hostToken: room.hostToken, lang: "en" });
    await host.next("welcome");
    host.send({ type: "addBot" });
    host.send({ type: "start" });
    await host.view((v) => v.phase === "countdown");
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.countdownEnd = Date.now() - 1;
    });
    await runDurableObjectAlarm(stubFor(room.code));
    await host.view((v) => v.phase === "trading");

    host.send({ type: "ready", value: true });
    let v = await host.view((x) => x.earlyEndAt !== null);
    expect(v.ready).toEqual({ count: 1, total: 1 });
    host.send({ type: "ready", value: false });
    v = await host.view((x) => x.earlyEndAt === null);
    host.send({ type: "ready", value: true });
    await host.view((x) => x.earlyEndAt !== null);
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.earlyEndAt = Date.now() - 1;
    });
    await runDurableObjectAlarm(stubFor(room.code));
    expect((await host.next("settled")).round).toBe(1);
    host.close();
  });

  it("no-limit rounds wait for everyone to be ready; games end after 4 hours", async () => {
    const room = await createRoom("Host");
    const host = await Client.open(`/ws/room/${room.code}`);
    host.send({ type: "hello", token: room.playerToken, hostToken: room.hostToken, lang: "en" });
    await host.next("welcome");
    // "End early" switched off on purpose: no-limit rounds must still end when everyone is ready.
    host.send({ type: "setConfig", config: { roundSeconds: 0, endEarly: false } });
    await host.view((v) => v.config.roundSeconds === 0);
    host.send({ type: "addBot" });
    host.send({ type: "start" });
    await host.view((v) => v.phase === "countdown");
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.countdownEnd = Date.now() - 1;
    });
    await runDurableObjectAlarm(stubFor(room.code));
    let v = await host.view((x) => x.phase === "trading");
    expect(v.deadline).toBeNull(); // no timer

    // Pause / resume keeps it timer-free.
    host.send({ type: "pause" });
    await host.view((x) => x.phase === "paused");
    host.send({ type: "resume" });
    v = await host.view((x) => x.phase === "trading");
    expect(v.deadline).toBeNull();

    // Everyone ready: the 3-second settle countdown starts even though endEarly is off.
    host.send({ type: "ready", value: true });
    v = await host.view((x) => x.earlyEndAt !== null);
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.earlyEndAt = Date.now() - 1;
    });
    await runDurableObjectAlarm(stubFor(room.code));
    expect((await host.next("settled")).round).toBe(1);
    v = await host.view((x) => x.round === 2);
    expect(v.deadline).toBeNull();

    // The 4-hour cap ends the game, then the room is cleaned up an hour later.
    const endsAt = await runInDurableObject(stubFor(room.code), (inst: Room) => {
      const r = (inst as unknown as { room: RoomState }).room;
      const at = r.gameEndsAt;
      r.gameEndsAt = Date.now() - 1;
      return at;
    });
    expect(endsAt).toBeGreaterThan(Date.now() + 3.9 * 60 * 60 * 1000);
    await runDurableObjectAlarm(stubFor(room.code));
    v = await host.view((x) => x.phase === "finished");
    expect(v.events.some((e) => e.code === "ev_time_limit")).toBe(true);
    expect(v.results?.ranking.length).toBe(2);
    host.close();
  });

  it("rejects non-host commands and bad messages", async () => {
    const room = await createRoom("Host");
    const p = await Client.open(`/ws/room/${room.code}`);
    p.send({ type: "start" });
    expect((await p.next("error")).code).toBe("hello_first");
    p.send({ type: "hello", lang: "en" });
    await p.next("welcome");
    p.send({ type: "join", name: "Pat" });
    await p.next("welcome");
    p.send({ type: "start" });
    expect((await p.next("error")).code).toBe("not_host");
    p.send({ type: "trade", stock: 99, side: "buy", qty: 1, seq: 1 });
    expect((await p.next("error")).code).toBe("bad_message");
    p.ws.send("not json");
    expect((await p.next("error")).code).toBe("bad_message");
    p.close();
  });

  it("pairs a TV by code and lets the display reconnect with its token", async () => {
    const room = await createRoom("Host");
    const tvRes = await worker.fetch("https://stocks.test/api/tv", { method: "POST" });
    const tv = (await tvRes.json()) as { pairCode: string; expiresAt: number };
    expect(tv.pairCode).toMatch(/^\d{6}$/);

    const tvSock = await worker.fetch(`https://stocks.test/ws/tv/${tv.pairCode}`, { headers: { Upgrade: "websocket" } });
    const tvWs = tvSock.webSocket!;
    const tvMsgs: { type: string; roomCode?: string; displayToken?: string }[] = [];
    let resolvePaired!: () => void;
    const paired = new Promise<void>((r) => (resolvePaired = r));
    tvWs.addEventListener("message", (e) => {
      const m = JSON.parse(e.data as string);
      tvMsgs.push(m);
      if (m.type === "paired") resolvePaired();
    });
    tvWs.accept();

    // Non-host token is refused.
    const bad = await worker.fetch(`https://stocks.test/api/rooms/${room.code}/pair`, {
      method: "POST",
      body: JSON.stringify({ hostToken: "f".repeat(32), pairCode: tv.pairCode }),
    });
    expect(bad.status).toBe(400);

    const ok = await worker.fetch(`https://stocks.test/api/rooms/${room.code}/pair`, {
      method: "POST",
      body: JSON.stringify({ hostToken: room.hostToken, pairCode: tv.pairCode }),
    });
    expect(await ok.json()).toEqual({ ok: true });
    await paired;
    const pm = tvMsgs.find((m) => m.type === "paired")!;
    expect(pm.roomCode).toBe(room.code);

    const display = await Client.open(`/ws/room/${room.code}`);
    display.send({ type: "hello", token: pm.displayToken, lang: "ko" });
    expect((await display.next("welcome")).role).toBe("display");
    const dv = await display.view();
    expect(dv.me).toBeNull();
    expect(dv.host).toBeNull();

    // The used pairing code is gone.
    const again = await worker.fetch(`https://stocks.test/api/rooms/${room.code}/pair`, {
      method: "POST",
      body: JSON.stringify({ hostToken: room.hostToken, pairCode: tv.pairCode }),
    });
    expect(await again.json()).toEqual({ ok: false, code: "pair_not_found" });
    display.close();
  });

  it("lets the host connect a TV after the game has started", async () => {
    const room = await createRoom("Host");
    const host = await Client.open(`/ws/room/${room.code}`);
    host.send({ type: "hello", token: room.playerToken, hostToken: room.hostToken, lang: "en" });
    await host.next("welcome");
    host.send({ type: "addBot" });
    host.send({ type: "start" });
    await host.view((v) => v.phase === "countdown");
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      (inst as unknown as { room: RoomState }).room.countdownEnd = Date.now() - 1;
    });
    await runDurableObjectAlarm(stubFor(room.code));
    await host.view((v) => v.phase === "trading");

    const tv = (await (await worker.fetch("https://stocks.test/api/tv", { method: "POST" })).json()) as { pairCode: string };
    const tvSock = (await worker.fetch(`https://stocks.test/ws/tv/${tv.pairCode}`, { headers: { Upgrade: "websocket" } })).webSocket!;
    const paired = new Promise<{ roomCode: string; displayToken: string }>((resolve) => {
      tvSock.addEventListener("message", (e) => {
        const m = JSON.parse(e.data as string);
        if (m.type === "paired") resolve(m);
      });
    });
    tvSock.accept();

    host.send({ type: "pairTv", pairCode: tv.pairCode });
    expect((await host.next("toast")).code).toBe("tv_paired");
    const pm = await paired;
    expect(pm.roomCode).toBe(room.code);
    const hv = await host.view((v) => (v.host?.displays.length ?? 0) === 1);
    expect(hv.phase).toBe("trading");

    const display = await Client.open(`/ws/room/${room.code}`);
    display.send({ type: "hello", token: pm.displayToken, lang: "en" });
    expect((await display.next("welcome")).role).toBe("display");
    const dv = await display.view();
    expect(dv.phase).toBe("trading");
    expect(dv.stocks.length).toBe(7);
    display.close();
    host.close();
  });

  it("returns 404 for unknown rooms", async () => {
    const res = await worker.fetch("https://stocks.test/api/rooms/ZZZZZ");
    expect(res.status).toBe(404);
    const ws = await worker.fetch("https://stocks.test/ws/room/ZZZZZ", { headers: { Upgrade: "websocket" } });
    expect(ws.status).toBe(404);
  });

  it("limits room creation per client IP (NFR-SEC-7)", async () => {
    const post = (ip: string) =>
      worker.fetch("https://stocks.test/api/rooms", {
        method: "POST",
        headers: { "CF-Connecting-IP": ip },
        body: JSON.stringify({ name: "Spam", lang: "en" }),
      });
    for (let i = 0; i < 5; i++) expect((await post("203.0.113.9")).status).toBe(200);
    const blocked = await post("203.0.113.9");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect((await post("203.0.113.10")).status).toBe(200); // another client is unaffected
  });

  it("answers the public health check without caching (NFR-OBS-4, NFR-OPS-1)", async () => {
    const res = await worker.fetch("https://stocks.test/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("lets the host download a finished game that replays exactly (NFR-OBS-2)", async () => {
    const room = await createRoom("Ana");
    const host = await Client.open(`/ws/room/${room.code}`);
    host.send({ type: "hello", token: room.playerToken, hostToken: room.hostToken, lang: "en" });
    await host.next("welcome");
    host.send({ type: "addBot" });
    await host.view((v) => v.lobby.length === 2);
    const url = `https://stocks.test/api/rooms/${room.code}/export`;
    // Not finished yet: nothing to export, so nothing hidden can leak.
    expect((await worker.fetch(url, { headers: { "x-host-token": room.hostToken } })).status).toBe(400);
    host.send({ type: "start" });
    await host.view((v) => v.phase === "countdown");
    host.send({ type: "endGame" });
    await host.view((v) => v.phase === "finished");

    expect((await worker.fetch(url, { headers: { "x-host-token": "f".repeat(32) } })).status).toBe(403);
    const res = await worker.fetch(url, { headers: { "x-host-token": room.hostToken } });
    expect(res.status).toBe(200);
    const file = (await res.json()) as { format: string; init: Parameters<typeof replay>[0]; actions: Parameters<typeof replay>[1] };
    expect(file.format).toBe("msm-game-v1");
    const replayed = replay(file.init, file.actions);
    await runInDurableObject(stubFor(room.code), (inst: Room) => {
      expect(replayed).toEqual((inst as unknown as { room: RoomState }).room.game);
    });
    host.close();
  });
});
