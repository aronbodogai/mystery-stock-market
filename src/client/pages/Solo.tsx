import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  applyAction,
  createGame,
  DEFAULT_CONFIG,
  project,
  projectDeltas,
  pushEvent,
  randomSeed,
  REVEAL_ROUNDS,
  settleRound,
  type Action,
  type BotSkill,
  type RoomState,
  type RuleSet,
} from "../../engine";
import { ROUND_SECONDS, type RoundSeconds } from "../../engine/room";
import { BOT_NAMES, cleanName } from "../../shared/names";
import type { ClientMsg, View } from "../../shared/protocol";
import { Nav, Toasts } from "../components/common";
import { useI18n } from "../i18n";
import type { Settled, Toast } from "../useRoom";
import { ResultsView } from "./Results";
import { GameBar, Trading } from "./Trading";

const ME = "me";
let toastId = 0;

/** Single-player mode: the same engine and projection, run entirely in the browser. */
function useSolo(
  setup: { name: string; bots: number; skill: BotSkill; ruleSet: RuleSet; roundSeconds: RoundSeconds } | null,
) {
  const { lang } = useI18n();
  const roomRef = useRef<RoomState | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: Toast["kind"], code: string, params?: Record<string, string | number>) => {
    const id = ++toastId;
    setToasts((xs) => [...xs.slice(-3), { id, kind, code, ...(params ? { params } : {}) }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 2600);
  }, []);

  const refresh = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    setView(
      project(r, { role: "player", playerId: ME, lang }, { connected: new Set([ME]), spectators: 0, now: Date.now() }),
    );
  }, [lang]);

  useEffect(() => {
    if (!setup) return;
    const seats = [
      { id: ME, name: setup.name },
      ...Array.from({ length: setup.bots }, (_, i) => ({
        id: `bot${i}`,
        name: BOT_NAMES[i] ?? `Bot ${i + 1}`,
        bot: { skill: setup.skill },
      })),
    ];
    const init = { seed: randomSeed(), ruleSet: setup.ruleSet, seats };
    const now = Date.now();
    roomRef.current = {
      v: 1,
      code: "SOLO0",
      origin: location.origin,
      createdAt: now,
      hostToken: "",
      hostId: ME,
      config: {
        ...DEFAULT_CONFIG,
        ruleSet: setup.ruleSet,
        roundSeconds: setup.roundSeconds,
        botSkill: setup.skill,
        lang,
      },
      players: seats.map((s) => ({
        id: s.id,
        name: s.name,
        token: null,
        bot: s.id !== ME,
        kicked: false,
        ready: false,
        lastSeq: 0,
      })),
      displays: [],
      phase: "trading",
      countdownEnd: null,
      deadline: setup.roundSeconds > 0 ? now + setup.roundSeconds * 1000 : null, // 0 = no limit
      pausedRemaining: null,
      earlyEndAt: null,
      game: createGame(init),
      gameInit: init,
      gameNo: 1,
      events: [],
      eventSeq: 0,
      lastActivity: now,
      finishedAt: null,
    };
    refresh();
    // setup is fixed once a game starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  useEffect(() => {
    refresh();
  }, [lang, refresh]);

  const settle = useCallback(() => {
    const r = roomRef.current;
    if (!r || !r.game || r.phase === "finished") return;
    const res = settleRound(r.game);
    for (const p of r.players) p.ready = false;
    pushEvent(r, "ev_settled", { round: res.round }, res.round);
    if (r.game.finished) {
      r.phase = "finished";
      r.deadline = null;
      r.finishedAt = Date.now();
    } else {
      r.deadline = r.config.roundSeconds > 0 ? Date.now() + r.config.roundSeconds * 1000 : null;
      const g = REVEAL_ROUNDS.indexOf(r.game.round as (typeof REVEAL_ROUNDS)[number]);
      if (g > 0) pushEvent(r, "ev_reveal", { group: g, round: r.game.round });
    }
    setSettled({ round: res.round, deltas: projectDeltas(r.game, res.deltas), at: Date.now() });
    refresh();
  }, [refresh]);

  // Round clock.
  useEffect(() => {
    const id = setInterval(() => {
      const r = roomRef.current;
      if (r && r.phase === "trading" && r.deadline !== null && Date.now() >= r.deadline) settle();
    }, 250);
    return () => clearInterval(id);
  }, [settle]);

  const send = useCallback(
    (msg: ClientMsg): boolean => {
      const r = roomRef.current;
      if (!r || !r.game) return false;
      if (msg.type === "ready") {
        if (msg.value) settle(); // solo: ready ends the round right away
        return true;
      }
      if (msg.type === "newGame") {
        window.location.reload();
        return true;
      }
      let a: Action | null = null;
      if (msg.type === "trade") a = { t: "trade", seat: ME, stock: msg.stock, side: msg.side, qty: msg.qty };
      if (msg.type === "placeSecret") a = { t: "secret", seat: ME, stock: msg.stock };
      if (msg.type === "usePiece")
        a = { t: "piece", seat: ME, kind: msg.kind, ...(msg.stock !== undefined ? { stock: msg.stock } : {}) };
      if (!a || r.phase !== "trading") return false;
      const res = applyAction(r.game, a);
      if (!res.ok) toast("error", res.code);
      else if (msg.type === "trade") toast("info", "trade_ok", { stock: msg.stock, side: msg.side, qty: msg.qty });
      else if (msg.type === "placeSecret") toast("info", "secret_placed", { stock: msg.stock });
      else if (msg.type === "usePiece")
        toast("info", msg.kind === "cash" ? "piece_cash" : "piece_peek", { stock: msg.stock ?? 0 });
      refresh();
      return true;
    },
    [refresh, settle, toast],
  );

  return { view, send, settled, toasts };
}

export function SoloPage() {
  const { t, tp, code } = useI18n();
  const [setup, setSetup] = useState<Parameters<typeof useSolo>[0]>(null);
  const [name, setName] = useState("");
  const [bots, setBots] = useState(5);
  const [skill, setSkill] = useState<BotSkill>("normal");
  const [ruleSet, setRuleSet] = useState<RuleSet>("show");
  const [roundSeconds, setRoundSeconds] = useState<RoundSeconds>(60);
  const [err, setErr] = useState<string | null>(null);
  const solo = useSolo(setup);

  const onStart = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) return setErr("bad_name");
    setSetup({ name: clean, bots, skill, ruleSet, roundSeconds });
  };

  if (!setup || !solo.view) {
    return (
      <>
        <Nav />
        <main className="container page narrow">
          <form className="card card-pad stack" onSubmit={onStart}>
            <span className="overline">{t("solo.overline")}</span>
            <h2>{t("solo.title")}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {t("solo.body")}
            </p>
            <label className="field">
              {t("join.nameLabel")}
              <input
                className={`input${err ? " invalid" : ""}`}
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("join.namePlaceholder")}
              />
            </label>
            {err && (
              <span className="small" style={{ color: "var(--error)" }}>
                {code("err", err)}
              </span>
            )}
            <div className="stack-sm">
              <span className="small muted">{tp("set.bots", bots)}</span>
              <input
                type="range"
                min={1}
                max={15}
                value={bots}
                onChange={(e) => setBots(Number(e.target.value))}
                aria-label={tp("set.bots", bots)}
              />
            </div>
            <div className="row wrap" style={{ gap: 16 }}>
              <div className="seg" role="group" aria-label={t("set.botSkill")}>
                {(["easy", "normal", "hard"] as const).map((s) => (
                  <button type="button" key={s} aria-pressed={skill === s} onClick={() => setSkill(s)}>
                    {t(`skill.${s}`)}
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label={t("set.ruleSet")}>
                {(["show", "random"] as const).map((s) => (
                  <button type="button" key={s} aria-pressed={ruleSet === s} onClick={() => setRuleSet(s)}>
                    {t(s === "show" ? "set.ruleShow" : "set.ruleRandom")}
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label={t("set.roundLength")}>
                {ROUND_SECONDS.map((s) => (
                  <button type="button" key={s} aria-pressed={roundSeconds === s} onClick={() => setRoundSeconds(s)}>
                    {s === 0 ? t("set.noLimit") : t("set.seconds", { n: s })}
                  </button>
                ))}
              </div>
            </div>
            <span className="caption">{t("solo.readyHint")}</span>
            <button className="btn btn-primary btn-lg">{t("solo.start")}</button>
          </form>
        </main>
      </>
    );
  }

  const view = solo.view;
  return (
    <>
      {view.phase === "finished" ? (
        <Nav wide logo={view.logo} />
      ) : (
        <GameBar
          view={view}
          offset={0}
          onMenu={() => undefined}
          onReady={(v) => solo.send({ type: "ready", value: v })}
        />
      )}
      <main className="container page room-width" style={{ paddingTop: 20 }}>
        {view.phase === "finished" ? (
          <ResultsView view={{ ...view, you: { ...view.you, role: "host" } }} send={solo.send} />
        ) : (
          <Trading view={view} send={solo.send} settled={solo.settled} offset={0} />
        )}
      </main>
      <Toasts toasts={solo.toasts} />
    </>
  );
}
