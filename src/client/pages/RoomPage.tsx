import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { cleanName } from "../../shared/names";
import type { ClientMsg, View } from "../../shared/protocol";
import { LangSwitch, Nav, Sheet, Toasts } from "../components/common";
import { FixedLang, useI18n } from "../i18n";
import { load, save } from "../storage";
import { useRemaining, useRoom } from "../useRoom";
import { IconSettings, IconSliders } from "../components/icons";
import { HostPanel, TvControls } from "./HostPanel";
import { HowToPlay } from "./HowToPlay";
import { Lobby } from "./Lobby";
import { ResultsView } from "./Results";
import { GameBar, Trading } from "./Trading";

function JoinForm({ view, send }: { view: View; send: (m: ClientMsg) => boolean }) {
  const { t, code } = useI18n();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) return setErr("bad_name");
    setErr(null);
    send({ type: "join", name: clean });
  };
  return (
    <form className="card card-pad stack narrow" onSubmit={onSubmit}>
      <span className="overline">{t("join.overline")}</span>
      <div className="mono" style={{ fontSize: 40, letterSpacing: "0.12em", lineHeight: 1 }}>
        {view.code}
      </div>
      <label className="field">
        {t("join.nameLabel")}
        <input
          className={`input${err ? " invalid" : ""}`}
          autoFocus
          value={name}
          maxLength={32}
          autoComplete="nickname"
          placeholder={t("join.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {err && (
        <span className="small" style={{ color: "var(--error)" }}>
          {code("err", err)}
        </span>
      )}
      <button className="btn btn-primary btn-lg">{t("join.submit")}</button>
      <span className="caption">{t("join.hint", { n: view.lobby.length })}</span>
    </form>
  );
}

function Countdown({ view, offset }: { view: View; offset: number }) {
  const { t } = useI18n();
  const left = useRemaining(view.countdownEnd, offset);
  return (
    <div className="card card-pad stack" style={{ alignItems: "center", textAlign: "center", padding: 48 }}>
      <span className="overline">{t("game.startingIn")}</span>
      <div className="display" style={{ fontSize: 96 }}>
        {Math.max(1, Math.ceil((left ?? 0) / 1000))}
      </div>
    </div>
  );
}

/**
 * Shown once per room on this device when you enter the lobby: the rules,
 * with a single "I understand" button (no other way to dismiss it).
 */
function RulesGate({ onAck }: { onAck: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="backdrop">
      <div
        ref={ref}
        className="sheet stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        tabIndex={-1}
        style={{ outline: "none" }}
      >
        <div className="row-between">
          <span className="overline">{t("rules.overline")}</span>
          <LangSwitch />
        </div>
        <HowToPlay titleId="rules-title" />
        <button className="btn btn-primary btn-lg btn-block" onClick={onAck}>
          {t("rules.understand")}
        </button>
      </div>
    </div>
  );
}

function Prefs({
  open,
  onClose,
  view,
  send,
}: {
  open: boolean;
  onClose: () => void;
  view: View;
  send: (m: ClientMsg) => boolean;
}) {
  const { t, upDown, setUpDown, locked, lang } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={t("common.settings")}>
      <div className="stack">
        {/* The host can add a TV from here too, at any point in the game. */}
        {view.you.role === "host" && <TvControls view={view} send={send} />}
        <div className="stack-sm">
          <span className="small muted">{t("common.language")}</span>
          {locked ? <span className="small">{t("set.langLocked", { lang: t(`lang.${lang}`) })}</span> : <LangSwitch />}
        </div>
        <div className="stack-sm">
          <span className="small muted">{t("prefs.colors")}</span>
          <div className="seg" role="group" aria-label={t("prefs.colors")}>
            <button aria-pressed={upDown === "kr"} onClick={() => setUpDown("kr")}>
              <span className="up">▲</span> <span className="down">▼</span> {t("prefs.korean")}
            </button>
            <button aria-pressed={upDown === "west"} onClick={() => setUpDown("west")}>
              {t("prefs.western")}
            </button>
          </div>
        </div>
        <HowToPlay />
      </div>
    </Sheet>
  );
}

export function RoomPage() {
  const { code: rawCode = "" } = useParams();
  const code = rawCode.toUpperCase();
  const { lang } = useI18n();
  const conn = useRoom(code, lang);
  // Once the game starts, the whole room screen uses the host's game language and the switchers hide.
  const gameLang = conn.view && conn.view.phase !== "lobby" ? conn.view.config.lang : null;
  return (
    <FixedLang lang={gameLang} companies={conn.view?.companies}>
      <RoomScreen code={code} conn={conn} />
    </FixedLang>
  );
}

function RoomScreen({ code, conn }: { code: string; conn: ReturnType<typeof useRoom> }) {
  const { t, code: tc } = useI18n();
  const [hostOpen, setHostOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const rulesKey = `msm:rulesAck:${code}`;
  const [rulesAck, setRulesAck] = useState(() => load<boolean>(rulesKey, false));
  const { view, send } = conn;

  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return <Navigate to="/" replace />;

  if (conn.fatal) {
    return (
      <>
        <Nav />
        <main className="container page narrow stack">
          <h2>{tc("err", conn.fatal)}</h2>
          <Link className="btn" to="/">
            {t("common.home")}
          </Link>
        </main>
      </>
    );
  }

  if (!view) {
    return (
      <>
        <Nav />
        <main className="container page narrow">
          <p className="muted">{conn.status === "reconnecting" ? t("conn.reconnecting") : t("conn.connecting")}</p>
        </main>
      </>
    );
  }

  const isHost = view.you.role === "host";
  const inGame = view.phase === "trading" || view.phase === "paused" || view.phase === "countdown";
  const connBanner =
    conn.status === "reconnecting" ? (
      <div className="banner" style={{ margin: "12px 0" }}>
        {t("conn.reconnecting")}
      </div>
    ) : null;

  return (
    <>
      {inGame && view.phase !== "countdown" ? (
        <GameBar
          view={view}
          offset={conn.offset}
          onHost={isHost ? () => setHostOpen(true) : undefined}
          onMenu={() => setPrefsOpen(true)}
          onReady={(value) => send({ type: "ready", value })}
        />
      ) : (
        <Nav
          wide
          logo={view.logo}
          right={
            <>
              {isHost && view.phase !== "lobby" && (
                <button
                  className="btn btn-sm icon-btn"
                  onClick={() => setHostOpen(true)}
                  aria-label={t("host.menu")}
                  title={t("host.menu")}
                >
                  <IconSliders />
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm icon-btn"
                onClick={() => setPrefsOpen(true)}
                aria-label={t("common.settings")}
                title={t("common.settings")}
              >
                <IconSettings />
              </button>
            </>
          }
        />
      )}
      <main className="container page room-width" style={{ paddingTop: 20 }}>
        {connBanner}
        {view.phase === "lobby" && view.you.role === "guest" && <JoinForm view={view} send={send} />}
        {view.phase === "lobby" && view.you.role !== "guest" && <Lobby view={view} send={send} onRules={() => setRulesAck(false)} />}
        {view.phase === "countdown" && <Countdown view={view} offset={conn.offset} />}
        {(view.phase === "trading" || view.phase === "paused") && (
          <Trading view={view} send={send} settled={conn.settled} offset={conn.offset} />
        )}
        {view.phase === "finished" && <ResultsView view={view} send={send} />}
      </main>
      {isHost && (
        <HostPanel
          view={view}
          send={send}
          open={hostOpen}
          onClose={() => setHostOpen(false)}
          onPrefs={() => setPrefsOpen(true)}
        />
      )}
      <Prefs open={prefsOpen} onClose={() => setPrefsOpen(false)} view={view} send={send} />
      {view.phase === "lobby" && view.you.role !== "guest" && !rulesAck && (
        <RulesGate
          onAck={() => {
            save(rulesKey, true);
            setRulesAck(true);
          }}
        />
      )}
      <Toasts toasts={conn.toasts} />
    </>
  );
}

/** /j/:code — the QR target. The room page asks guests for a name. */
export function JoinRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={`/r/${code.toUpperCase()}`} replace />;
}
