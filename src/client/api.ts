import type { Lang } from "../shared/lang";
import { CreateRoomResZ, CreateTvResZ, type CreateRoomRes, type CreateTvRes } from "../shared/protocol";

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function post<T>(path: string, body: unknown, parse: (x: unknown) => T): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError("network");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? data.code ?? `http_${res.status}`);
  return parse(data);
}

export function createRoom(name: string, lang: Lang): Promise<CreateRoomRes> {
  return post("/api/rooms", { name, lang }, (x) => CreateRoomResZ.parse(x));
}

export function createTv(): Promise<CreateTvRes> {
  return post("/api/tv", {}, (x) => CreateTvResZ.parse(x));
}

export async function roomInfo(code: string): Promise<{ exists: boolean; phase: string | null }> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    if (res.status === 429) throw new ApiError("rate_limited");
    return (await res.json()) as { exists: boolean; phase: string | null };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("network");
  }
}

export async function pairWithHost(code: string, hostToken: string, pairCode: string): Promise<void> {
  await post(`/api/rooms/${code}/pair`, { hostToken, pairCode }, (x) => x);
}

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
