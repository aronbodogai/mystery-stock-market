/**
 * The MCP server's way into a room: one short-lived WebSocket per tool call,
 * opened on the Room Durable Object exactly like a phone's, so agents go
 * through the same validation, rate limits, engine and per-seat projection as
 * people (NFR-MCP-3). The socket carries the logged-in account (AGENT_HEADER),
 * which marks the seat as an agent's and ties it to that account.
 */
import type { Lang } from "../../shared/lang";
import type { ClientMsg, ServerMsg, View } from "../../shared/protocol";
import { allow } from "../limiter";
import { AGENT_HEADER } from "../room";
import { isRoomCode } from "../util";

const REPLY_TIMEOUT_MS = 5_000;

/** A failure the agent can act on: a code from the room protocol plus its params. */
export class GameError extends Error {
  constructor(
    public code: string,
    public params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

export interface Caller {
  env: Env;
  /** Hash of the logged-in account (see access.ts). */
  account: string;
}

/** One WebSocket to a Room, read as a queue of server messages. */
export class RoomSocket {
  private queue: ServerMsg[] = [];
  private waiters: (() => void)[] = [];
  private closed = false;

  constructor(private ws: WebSocket) {
    ws.accept();
    ws.addEventListener("message", (e) => {
      try {
        this.queue.push(JSON.parse(typeof e.data === "string" ? e.data : "") as ServerMsg);
      } catch {
        /* not JSON: ignore */
      }
      this.wake();
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      this.wake();
    });
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** The next message, or null on timeout, close or cancel. */
  async next(timeoutMs: number, signal?: AbortSignal): Promise<ServerMsg | null> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const m = this.queue.shift();
      if (m) return m;
      const left = end - Date.now();
      if (this.closed || left <= 0 || signal?.aborted) return null;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, left);
        signal?.addEventListener("abort", done, { once: true });
        this.waiters.push(done);
      });
    }
  }

  /** Sends the messages, then a ping, and returns every reply up to the pong (a room handles messages in order). */
  async exchange(msgs: ClientMsg[]): Promise<ServerMsg[]> {
    for (const m of msgs) this.send(m);
    this.send({ type: "ping" });
    const out: ServerMsg[] = [];
    for (;;) {
      const m = await this.next(REPLY_TIMEOUT_MS);
      if (!m) {
        if (out.some((x) => x.type === "error")) return out; // e.g. kicked: the room closed the socket after saying why
        throw new GameError(this.closed ? "room_closed" : "try_again");
      }
      if (m.type === "pong") return out;
      out.push(m);
    }
  }

  /** Asks the room for a fresh view of this seat. */
  async view(lang: Lang): Promise<View> {
    const v = lastView(await this.exchange([{ type: "setLang", lang }]));
    if (!v) throw new GameError("try_again");
    return v;
  }

  /** Waits for the room to push something new to this seat; null after the timeout or a cancel. */
  async waitForUpdate(ms: number, signal?: AbortSignal): Promise<boolean> {
    const end = Date.now() + ms;
    for (;;) {
      const m = await this.next(end - Date.now(), signal);
      if (!m) return false;
      if (m.type === "view" || m.type === "patch" || m.type === "settled") return true;
      if (m.type === "error") throw new GameError(m.code, m.params);
    }
  }

  close(): void {
    try {
      this.ws.close(1000, "done");
    } catch {
      /* already closed */
    }
  }
}

export function lastView(msgs: ServerMsg[]): View | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.type === "view") return m.view;
  }
  return null;
}

export function throwIfError(msgs: ServerMsg[]): void {
  const err = msgs.find((m) => m.type === "error");
  if (err && err.type === "error") throw new GameError(err.code, err.params);
}

export async function openRoom(caller: Caller, roomCode: string): Promise<RoomSocket> {
  const code = roomCode.trim().toUpperCase();
  if (!isRoomCode(code)) throw new GameError("bad_code");
  if (!(await allow(caller.env, `account:${caller.account}`, "connect"))) throw new GameError("rate_limited");
  const res = await caller.env.ROOM.getByName(code).fetch("https://room.internal/ws", {
    headers: { Upgrade: "websocket", [AGENT_HEADER]: caller.account },
  });
  if (res.status === 404) throw new GameError("not_found");
  if (res.status === 429) throw new GameError("room_busy");
  if (!res.webSocket) throw new GameError("try_again");
  return new RoomSocket(res.webSocket);
}

/**
 * Opens a socket and says hello with the seat token (a player token, or the host
 * token, which is also accepted as `hostToken`). Without a token the caller is a guest.
 */
export async function sit(caller: Caller, roomCode: string, token: string | undefined, lang: Lang) {
  const sock = await openRoom(caller, roomCode);
  try {
    const hello = await sock.exchange([{ type: "hello", lang, ...(token ? { token, hostToken: token } : {}) }]);
    throwIfError(hello);
    const view = lastView(hello);
    if (!view) throw new GameError("try_again");
    return { sock, view };
  } catch (e) {
    sock.close();
    throw e;
  }
}

/** Runs room messages in one seat; returns the fresh view and everything the room said back. */
export async function act(caller: Caller, roomCode: string, token: string, lang: Lang, msgs: ClientMsg[]) {
  const { sock } = await sit(caller, roomCode, token, lang);
  try {
    const replies = await sock.exchange(msgs);
    throwIfError(replies);
    return { view: await sock.view(lang), replies };
  } finally {
    sock.close();
  }
}
