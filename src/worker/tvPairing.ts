import { DurableObject } from "cloudflare:workers";
import type { TvMsg } from "../shared/protocol";

export const PAIR_TTL_MS = 10 * 60 * 1000;

interface PairRecord {
  pairCode: string;
  expiresAt: number;
}

/**
 * One instance per 6-digit pairing code. Holds the waiting TV's socket until
 * the host's Room claims it, then pushes { roomCode, displayToken } to the TV
 * and deletes itself.
 */
export class TvPairing extends DurableObject<Env> {
  private async record(): Promise<PairRecord | null> {
    const rec = (await this.ctx.storage.get<PairRecord>("pair")) ?? null;
    if (rec && rec.expiresAt <= Date.now()) return null;
    return rec;
  }

  /** Returns false if the code is already in use. */
  async init(pairCode: string, expiresAt: number): Promise<boolean> {
    if (await this.record()) return false;
    await this.ctx.storage.put<PairRecord>("pair", { pairCode, expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const rec = await this.record();
    if (!rec) return new Response("Unknown or expired pairing code", { status: 404 });
    if (this.ctx.getWebSockets().length >= 4) return new Response("Too many connections", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    this.send(server, { type: "waiting", pairCode: rec.pairCode, expiresAt: rec.expiresAt });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Called by the Room over RPC. True if a TV was waiting and has been told. */
  async claim(roomCode: string, displayToken: string): Promise<boolean> {
    const rec = await this.record();
    const sockets = this.ctx.getWebSockets();
    if (!rec || sockets.length === 0) return false;
    for (const ws of sockets) {
      this.send(ws, { type: "paired", roomCode, displayToken });
      try {
        ws.close(1000, "paired");
      } catch {
        /* already closing */
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return true;
  }

  override async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { type: "expired" });
      try {
        ws.close(1000, "expired");
      } catch {
        /* ignore */
      }
    }
    await this.ctx.storage.deleteAll();
  }

  override async webSocketMessage(): Promise<void> {
    // The TV never needs to talk; pings are answered by the runtime.
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1000, reason);
    } catch {
      /* ignore */
    }
  }

  private send(ws: WebSocket, msg: TvMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }
}
