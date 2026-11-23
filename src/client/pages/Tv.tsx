import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { TvMsgZ, type View } from "../../shared/protocol";
import { createTv, wsUrl } from "../api";
import { CompanyLogo } from "../components/CompanyLogo";
import { Explainer } from "../components/Explainer";
import { LogoMark } from "../components/Logo";
import { QR } from "../components/QR";
import { RuleText } from "../components/RuleText";
import { Sparkline } from "../components/Sparkline";
import { Delta, formatClock, useTween } from "../components/common";
import { FixedLang, useI18n } from "../i18n";
import { load, save, setCreds } from "../storage";
import { useRemaining, useRoom } from "../useRoom";
import { AllRules, Podium, RankingList } from "./Results";
import { Standings } from "./Trading";

/**
 * The TV: a read-only board for across the room. Shows the host's game language (English before pairing), no menus,
 * no scrolling. Everything is sized in viewport units so it fills any 16:9 screen.
 */

interface TvLink {
  roomCode: string;
}

const vw = (n: number) => Math.round((window.innerWidth * n) / 100);
const vh = (n: number) => Math.round((window.innerHeight * n) / 100);

function prettyPair(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Logo + game name, used as a quiet corner mark (not a nav bar). */
function Brand({ logo = [], code }: { logo?: readonly number[]; code?: string }) {
  const { t } = useI18n();
  return (
    <div className="row" style={{ gap: "1vw" }}>
      <LogoMark shape={logo} size={vw(2.6)} />
      <span className="display" style={{ fontSize: "1.6vw" }}>
        {t("app.name")}
      </span>
      {code && (
        <span className="mono muted" style={{ fontSize: "1.3vw" }}>
          {code}
        </span>
      )}
    </div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="tv">{children}</div>;
}

// ------------------------------------------------------------------ pairing

function Pairing({ onPaired }: { onPaired: (code: string) => void }) {
  const { t } = useI18n();
  const [pair, setPair] = useState<{ pairCode: string; expiresAt: number; origin: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const pairedRef = useRef(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    (async () => {
      try {
        const p = await createTv();
        if (cancelled) return;
        setPair(p);
        setFailed(false);
        ws = new WebSocket(wsUrl(`/ws/tv/${p.pairCode}`));
        ws.onmessage = (e) => {
          const msg = TvMsgZ.safeParse(JSON.parse(String(e.data)));
          if (!msg.success) return;
          if (msg.data.type === "paired") {
            pairedRef.current = true;
            setCreds(msg.data.roomCode, { displayToken: msg.data.displayToken });
            onPaired(msg.data.roomCode);
          } else if (msg.data.type === "expired") refresh();
        };
        ws.onclose = () => {
          if (!cancelled && !pairedRef.current) timer = setTimeout(refresh, 1500);
        };
        // Fetch a fresh code shortly before this one expires.
        timer = setTimeout(refresh, Math.max(5_000, p.expiresAt - Date.now() - 5_000));
      } catch {
        if (!cancelled) {
          setFailed(true);
          timer = setTimeout(refresh, 4_000);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [nonce, onPaired, refresh]);

  const host = (pair?.origin ?? location.origin).replace(/^https?:\/\//, "");
  return (
    <Screen>
      <Brand />
      <div className="tv-center">
        <div className="stack" style={{ gap: "3vh" }}>
          <span className="overline" style={{ fontSize: "1.1vw" }}>
            {t("tv.pairCode")}
          </span>
          <div className="tv-code">{pair ? prettyPair(pair.pairCode) : "··· ···"}</div>
          <p style={{ fontSize: "1.6vw", maxWidth: "48vw", margin: 0 }} className="muted">
            {t("tv.pairHelp", { url: `${host}/tv` })}
          </p>
          {failed && <p style={{ color: "var(--error)", fontSize: "1.2vw", margin: 0 }}>{t("conn.reconnecting")}</p>}
        </div>
        {pair && (
          <div className="stack" style={{ alignItems: "center", gap: "2vh" }}>
            <QR value={`${pair.origin}/pair/${pair.pairCode}`} size={vh(38)} label={t("tv.scanToPair")} />
            <span className="muted" style={{ fontSize: "1.2vw" }}>
              {t("tv.scanToPair")}
            </span>
          </div>
        )}
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ lobby

function TvLobby({ view }: { view: View }) {
  const { t } = useI18n();
  const url = `${view.origin}/j/${view.code}`;
  // While people join, the TV plays the rules explainer on a loop (like the host briefing in the show).
  return (
    <Screen>
      <Brand logo={view.logo} />
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
          gap: "2.5vw",
          minHeight: 0,
        }}
      >
        <Explainer tv autoPlay loop />
        <div className="stack" style={{ gap: "1.6vh", minHeight: 0, alignItems: "flex-start" }}>
          <div className="row" style={{ gap: "1.5vw", alignItems: "center" }}>
            <QR value={url} size={vh(26)} label={t("lobby.scanToJoin")} />
            <div className="stack-sm" style={{ gap: "1vh" }}>
              <span className="overline" style={{ fontSize: "1vw" }}>
                {t("lobby.roomCode")}
              </span>
              <div className="mono tv-room-code" style={{ fontSize: "4.6vw", lineHeight: 1, letterSpacing: "0.06em" }}>
                {view.code}
              </div>
              <span className="muted" style={{ fontSize: "1.1vw" }}>
                {url.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </div>
          <span className="overline" style={{ fontSize: "1vw", marginTop: "1vh" }}>
            {t("lobby.players")} · {view.seats.count}/{view.seats.max}
          </span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1vh 1.5vw",
              fontSize: "1.5vw",
              width: "100%",
            }}
          >
            {view.lobby.map((p) => (
              <div key={p.id} className="row" style={{ minWidth: 0, gap: "0.6vw" }}>
                <span className={`dot${p.connected ? " on" : ""}`} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {p.bot && <span className="badge">{t("common.bot")}</span>}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "1.2vw", margin: 0 }}>
            {t("lobby.waiting")}
          </p>
        </div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ trading board

function TvStock({ view, i, flash }: { view: View; i: number; flash: boolean }) {
  const { t, money, stock } = useI18n();
  const s = view.stocks[i]!;
  const price = useTween(s.price);
  return (
    <div className={`card tvb-card${flash && s.delta !== null ? " stock-flash" : ""}`}>
      <div className="row-between" style={{ alignItems: "center", gap: "0.6vw" }}>
        <span className="row" style={{ gap: "0.7vw", minWidth: 0 }}>
          <CompanyLogo i={i} size="2.4vw" />
          <span className="stock-name">{stock(i)}</span>
        </span>
        {s.hidden && <span className="chip chip-warning">{t("stock.hidden")}</span>}
      </div>
      <div className="tvb-price">
        <span className={`price${s.price === null ? " unknown" : ""}`}>
          {s.price === null ? "???" : money(price ?? s.price)}
        </span>
        {s.price === null ? <span className="delta unknown">???</span> : <Delta value={s.delta} align="left" />}
      </div>
      <div className="tvb-chart">
        {/* Scaled to the rounds played so far (min 8) so early charts aren't a sliver at the left edge. */}
        <Sparkline
          points={s.chart}
          width={300}
          height={120}
          totalRounds={Math.max(8, s.chart.length - 1)}
          strokeWidth={2.6}
        />
      </div>
    </div>
  );
}

function TvTrading({ view, offset, flash }: { view: View; offset: number; flash: boolean }) {
  const { t, code, stock } = useI18n();
  // When everyone is ready the clock counts down the settling seconds instead of the round deadline.
  const left = useRemaining(view.phase === "trading" ? (view.earlyEndAt ?? view.deadline) : null, offset);
  const early = useRemaining(view.earlyEndAt, offset);
  return (
    <div className="tvb">
      <div className="tvb-board">
        {view.stocks.map((_, i) => (
          <TvStock key={i} view={view} i={i} flash={flash} />
        ))}
        {/* The game logo, big: it is the logo rule hiding in plain sight. */}
        <div className="card tvb-card tvb-brand">
          <LogoMark shape={view.logo} size={vw(5.5)} />
          <span className="display" style={{ fontSize: "1.5vw" }}>
            {t("app.name")}
          </span>
          <span className="mono muted" style={{ fontSize: "1.6vw", letterSpacing: "0.1em" }}>
            {view.code}
          </span>
        </div>
      </div>

      <section className="card tvb-rules">
        <div className="row-between" style={{ padding: "1vh 1.2vw 0.4vh" }}>
          <span className="overline" style={{ fontSize: "0.85vw" }}>
            {t("game.rules")}
          </span>
          {view.nextReveal !== null && (
            <span className="chip chip-warning">{t("game.revealAt", { r: view.nextReveal })}</span>
          )}
        </div>
        <div className="divided">
          {view.stocks.map((s, i) => (
            <div key={i} className="tvb-rule-row">
              <span className="row" style={{ gap: "0.6vw", minWidth: 0 }}>
                <CompanyLogo i={i} size="1.6vw" />
                <span className="stock-name">{stock(i)}</span>
              </span>
              <RuleText tokens={s.rule} publicLevel={view.revealLevel} />
            </div>
          ))}
        </div>
      </section>

      <aside className="tvb-side">
        <div className="card" style={{ padding: "1.2vw" }}>
          <span className="overline" style={{ fontSize: "0.85vw" }}>
            {t("game.round")}
          </span>
          <div className="display num" style={{ fontSize: "3.4vw" }}>
            {String(view.round).padStart(2, "0")}/{view.totalRounds}
          </div>
          <div className={`tv-clock${left !== null && left < 10_000 ? " clock low" : ""}`}>
            {view.phase === "paused" ? (
              t("game.paused")
            ) : left !== null ? (
              formatClock(left)
            ) : view.config.roundSeconds === 0 ? (
              <span style={{ fontSize: "1.4em", lineHeight: 1 }}>∞</span>
            ) : (
              "–:––"
            )}
          </div>
          <div className="muted" style={{ marginTop: "1vh", fontSize: "1.1vw" }}>
            {view.earlyEndAt !== null
              ? t("game.settlingIn", { s: Math.ceil((early ?? 0) / 1000) })
              : t("game.readyCount", { n: view.ready.count, total: view.ready.total })}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ padding: "1vw 1vw 0.4vw" }} className="row-between">
            <span className="overline" style={{ fontSize: "0.85vw" }}>
              {t("game.standings")}
            </span>
            {view.anySecret && <span className="chip chip-warning">{t("game.secretShort")}</span>}
          </div>
          <Standings view={view} big />
        </div>
        <div className="card" style={{ padding: "1vw", maxHeight: "22vh", overflow: "hidden" }}>
          <span className="overline" style={{ fontSize: "0.85vw" }}>
            {t("feed.title")}
          </span>
          <div className="stack-sm" style={{ gap: "0.5vh", marginTop: "0.8vh", fontSize: "0.95vw" }}>
            {view.events
              .slice(-4)
              .reverse()
              .map((e) => (
                <div key={e.id} className="row-between">
                  <span>{code("ev", e.code, e.params)}</span>
                  {e.round !== null && <span className="caption num">R{e.round}</span>}
                </div>
              ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ results

function TvResults({ view }: { view: View }) {
  const { t } = useI18n();
  const res = view.results!;
  return (
    <Screen>
      <Brand logo={view.logo} code={view.code} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: "2vw", minHeight: 0 }}>
        <div className="stack" style={{ gap: "2vh", minHeight: 0 }}>
          <h1 style={{ fontSize: "3.6vw" }}>{t("results.title")}</h1>
          <Podium results={res} big />
          <div className="card" style={{ overflow: "hidden", flex: 1, minHeight: 0, fontSize: "1.2vw" }}>
            <RankingList results={res} />
          </div>
        </div>
        <div className="card" style={{ padding: "1.4vw", overflow: "hidden" }}>
          <span className="overline" style={{ fontSize: "0.9vw" }}>
            {t("results.rules")}
          </span>
          <AllRules results={res} compact />
          <div className="muted" style={{ marginTop: "1vh", fontSize: "0.9vw" }}>
            {t("results.seed")} <span className="mono">{res.seed}</span>
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ room

function TvRoom({ code, onUnpair }: { code: string; onUnpair: () => void }) {
  const { lang } = useI18n();
  const conn = useRoom(code, lang, { display: true });
  // The TV shows the host's game language (English until the room tells us otherwise).
  return (
    <FixedLang lang={conn.view?.config.lang ?? "en"}>
      <TvRoomBody conn={conn} onUnpair={onUnpair} />
    </FixedLang>
  );
}

function TvRoomBody({ conn, onUnpair }: { conn: ReturnType<typeof useRoom>; onUnpair: () => void }) {
  const { t } = useI18n();
  const view = conn.view;
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (conn.fatal) onUnpair();
  }, [conn.fatal, onUnpair]);
  useEffect(() => {
    if (!conn.settled) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1000);
    return () => clearTimeout(id);
  }, [conn.settled]);
  const countdown = useRemaining(view?.phase === "countdown" ? view.countdownEnd : null, conn.offset);

  const reconnecting = conn.status === "reconnecting" && (
    <span className="chip chip-warning tv-conn">{t("conn.reconnecting")}</span>
  );

  if (!view) {
    return (
      <Screen>
        <Brand />
        <div className="tv-center muted" style={{ fontSize: "2vw" }}>
          {conn.status === "reconnecting" ? t("conn.reconnecting") : t("conn.connecting")}
        </div>
      </Screen>
    );
  }
  return (
    <>
      {reconnecting}
      {view.phase === "lobby" && <TvLobby view={view} />}
      {view.phase === "countdown" && (
        <Screen>
          <Brand logo={view.logo} code={view.code} />
          <div className="tv-center">
            <div className="stack" style={{ alignItems: "center" }}>
              <span className="overline" style={{ fontSize: "1.4vw" }}>
                {t("game.startingIn")}
              </span>
              <div className="display" style={{ fontSize: "16vw" }}>
                {Math.max(1, Math.ceil((countdown ?? 0) / 1000))}
              </div>
            </div>
          </div>
        </Screen>
      )}
      {(view.phase === "trading" || view.phase === "paused") && (
        <TvTrading view={view} offset={conn.offset} flash={flash} />
      )}
      {view.phase === "finished" && view.results && <TvResults view={view} />}
    </>
  );
}

export function TvPage() {
  const [link, setLink] = useState<TvLink | null>(() => load<TvLink | null>("msm:tv", null));
  const onPaired = useCallback((roomCode: string) => {
    save("msm:tv", { roomCode });
    setLink({ roomCode });
  }, []);
  const onUnpair = useCallback(() => {
    save("msm:tv", null);
    setLink(null);
  }, []);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  // English until paired; inside a room the TV switches to the host's game language.
  return (
    <FixedLang lang="en">
      {link ? <TvRoom code={link.roomCode} onUnpair={onUnpair} /> : <Pairing onPaired={onPaired} />}
    </FixedLang>
  );
}
