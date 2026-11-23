/** localStorage wrapped in try/catch: private windows and blocked storage must not break the app. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export interface RoomCreds {
  /** Player token for this room. */
  token?: string;
  /** Host token (only on the host's device). */
  hostToken?: string;
  /** Display token (TVs). */
  displayToken?: string;
  /** Next trade sequence number. */
  seq?: number;
  savedAt?: number;
}

const credKey = (code: string) => `msm:room:${code}`;

export function getCreds(code: string): RoomCreds {
  return load<RoomCreds>(credKey(code), {});
}

export function setCreds(code: string, patch: Partial<RoomCreds>): RoomCreds {
  const next = { ...getCreds(code), ...patch, savedAt: Date.now() };
  for (const k of Object.keys(next) as (keyof RoomCreds)[]) if (next[k] === undefined) delete next[k];
  save(credKey(code), next);
  return next;
}

/** Rooms this device hosts, newest first (for the /pair page). */
export function hostedRooms(): { code: string; hostToken: string; savedAt: number }[] {
  const out: { code: string; hostToken: string; savedAt: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("msm:room:")) continue;
      const c = load<RoomCreds>(k, {});
      if (c.hostToken) out.push({ code: k.slice(9), hostToken: c.hostToken, savedAt: c.savedAt ?? 0 });
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function nextSeq(code: string): number {
  const c = getCreds(code);
  const seq = (c.seq ?? Date.now()) + 1; // start from a timestamp so a reset device never reuses old seqs
  setCreds(code, { seq });
  return seq;
}
