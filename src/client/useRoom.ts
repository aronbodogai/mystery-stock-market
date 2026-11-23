import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../shared/lang";
import { ServerMsgZ, type ClientMsg, type Role, type View } from "../shared/protocol";
import { roomInfo, wsUrl } from "./api";
import { getCreds, setCreds } from "./storage";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "gone";

export interface Toast {
  id: number;
  kind: "info" | "error";
  code: string;
  params?: Record<string, string | number>;
}

export interface Settled {
  round: number;
  deltas: (number | null)[];
  at: number;
}

export interface RoomConn {
  status: ConnStatus;
  view: View | null;
  role: Role | null;
  playerId: string | null;
  /** serverNow - Date.now(), for clock-skew-corrected countdowns. */
  offset: number;
  settled: Settled | null;
  toasts: Toast[];
  /** Code that ended the session for good (kicked, room_closed, unpaired, not_found). */
  fatal: string | null;
  send: (msg: ClientMsg) => boolean;
  dismiss: (id: number) => void;
}

const FATAL = new Set(["kicked", "room_closed", "unpaired"]);
let toastSeq = 0;

export function useRoom(code: string, lang: Lang, opts: { display?: boolean } = {}): RoomConn {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [view, setView] = useState<View | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq;
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.kind === "error" ? 4200 : 2600);
  }, []);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let fatalHit = false;

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl(`/ws/room/${code}`));
      wsRef.current = ws;
      let sentHostToken = false;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        attempt = 0;
        setStatus("open");
        const c = getCreds(code);
        const token = opts.display ? c.displayToken : c.token;
        sentHostToken = !opts.display && !!c.hostToken;
        ws.send(
          JSON.stringify({
            type: "hello",
            lang: langRef.current,
            ...(token ? { token } : {}),
            ...(sentHostToken ? { hostToken: c.hostToken } : {}),
          } satisfies ClientMsg),
        );
        ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 25_000);
      };

      ws.onmessage = (e) => {
        let data: unknown;
        try {
          data = JSON.parse(String(e.data));
        } catch {
          return;
        }
        const parsed = ServerMsgZ.safeParse(data);
        if (!parsed.success) return;
        const msg = parsed.data;
        switch (msg.type) {
          case "welcome":
            setRole(msg.role);
            setPlayerId(msg.playerId);
            if (msg.token) setCreds(code, { token: msg.token });
            if (msg.hostToken) setCreds(code, { hostToken: msg.hostToken });
            // We offered a host token and the server did not accept it (revoked or transferred): forget it.
            else if (msg.role !== "host" && sentHostToken) setCreds(code, { hostToken: undefined });
            break;
          case "view":
            setView(msg.view);
            setOffset(msg.view.serverNow - Date.now());
            break;
          case "patch":
            setView((v) => (v ? { ...v, me: msg.me } : v));
            setOffset(msg.serverNow - Date.now());
            break;
          case "settled":
            setSettled({ round: msg.round, deltas: msg.deltas, at: Date.now() });
            break;
          case "pong":
            setOffset(msg.serverNow - Date.now());
            break;
          case "toast":
            pushToast({ kind: "info", code: msg.code, ...(msg.params ? { params: msg.params } : {}) });
            break;
          case "error":
            if (FATAL.has(msg.code)) {
              fatalHit = true;
              setFatal(msg.code);
              if (msg.code === "unpaired") setCreds(code, { displayToken: undefined });
            } else if (msg.code === "unknown_token") {
              setCreds(code, opts.display ? { displayToken: undefined } : { token: undefined });
            } else {
              pushToast({ kind: "error", code: msg.code, ...(msg.params ? { params: msg.params } : {}) });
            }
            break;
        }
      };

      ws.onclose = async () => {
        if (ping) clearInterval(ping);
        if (stopped || fatalHit) return;
        attempt += 1;
        if (!opened && attempt >= 2) {
          try {
            const info = await roomInfo(code);
            if (!info.exists) {
              setFatal("not_found");
              setStatus("gone");
              return;
            }
          } catch {
            /* offline: keep retrying */
          }
        }
        setStatus("reconnecting");
        const delay = Math.min(10_000, 400 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5);
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    const onVisible = () => {
      // Phones drop sockets in the background; reconnect quickly when the tab returns.
      if (document.visibilityState === "visible" && wsRef.current && wsRef.current.readyState === WebSocket.CLOSED) {
        if (timer) clearTimeout(timer);
        attempt = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisible);
      wsRef.current?.close(1000, "leave");
    };
  }, [code, opts.display, pushToast]);

  // Language switch: the server re-renders rule text for this socket.
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "setLang", lang }));
  }, [lang]);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const dismiss = useCallback((id: number) => setToasts((xs) => xs.filter((x) => x.id !== id)), []);

  return { status, view, role, playerId, offset, settled, toasts, fatal, send, dismiss };
}

/** Milliseconds until `target` (server epoch ms), corrected for skew. Re-renders every 250 ms. */
export function useRemaining(target: number | null, offset: number): number | null {
  // The interval only triggers re-renders; the time is read fresh on every render, so the
  // first render after a new target is right too (no stale clock from before it existed).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (target === null) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [target]);
  if (target === null) return null;
  return Math.max(0, target - (Date.now() + offset));
}
