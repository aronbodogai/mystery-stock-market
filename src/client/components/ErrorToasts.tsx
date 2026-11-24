import { useEffect, useState } from "react";
import type { Toast } from "../useRoom";
import { Toasts } from "./common";

/** Short, stable code for an error message, so a player can quote it in a report. */
function errorCode(message: string): string {
  let h = 0;
  for (let i = 0; i < message.length; i++) h = (Math.imul(31, h) + message.charCodeAt(i)) | 0;
  return `c${(h >>> 0).toString(36).slice(0, 6)}`;
}

/** The room code in the address bar, if any (logged with the error; never names or tokens). */
const roomFromPath = () => location.pathname.match(/^\/(?:r|j)\/([A-Za-z0-9]{5})/)?.[1]?.toUpperCase() ?? null;

/**
 * NFR-OBS-3: an uncaught error or rejected promise shows a short toast with a
 * code and logs one JSON line with that code and the room, instead of failing silently.
 */
export function ErrorToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let id = 0;
    const report = (message: string) => {
      const code = errorCode(message);
      console.error(JSON.stringify({ ev: "client_error", code, room: roomFromPath(), message: message.slice(0, 300) }));
      const toast: Toast = { id: ++id, kind: "error", code: "unknown", params: { code } };
      setToasts((t) => [...t.slice(-2), toast]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 6000);
    };
    const onError = (e: ErrorEvent) => report(e.message || "error");
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return <Toasts toasts={toasts} />;
}
