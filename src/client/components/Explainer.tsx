import { useCallback, useEffect, useRef, useState } from "react";
import { STOCK_IDS } from "../../engine/constants";
import { SHOW_LOGO, logoShape } from "../../engine/rules";
import type { Lang } from "../../shared/lang";
import type { MsgKey } from "../../shared/i18n";
import type { RuleToken } from "../../shared/protocol";
import { useI18n } from "../i18n";
import { load, save } from "../storage";
import { CompanyLogo } from "./CompanyLogo";
import { IconCash, IconCheck, IconPeek } from "./icons";
import { LogoMark } from "./Logo";
import { RuleText } from "./RuleText";
import { Delta } from "./common";

/**
 * The rules explainer: a short, gameshow-style walkthrough built from the real
 * game visuals. It plays like a video (play / pause / restart / skip / mute),
 * narrates each scene and always shows captions.
 *
 * Narration: pre-generated MP3s from /explainer/<lang>/<scene>.mp3 when the
 * manifest lists them (see scripts/explainer-audio), otherwise the browser's
 * built-in speech voice, otherwise captions only.
 */

export const SCENES = [
  "intro",
  "market",
  "trade",
  "settle",
  "rules",
  "clues",
  "secret",
  "pieces",
  "ready",
  "end",
] as const;
type SceneId = (typeof SCENES)[number];
const narrationKey = (i: number) => `ex.s${i + 1}` as MsgKey;

// ------------------------------------------------------------------ narration sources

type Manifest = { files?: Partial<Record<Lang, string[]>> };
let manifestPromise: Promise<Manifest> | null = null;
function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch("/explainer/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}));
  return manifestPromise;
}

const SPEECH_LANG: Record<Lang, string> = { en: "en-US", hu: "hu-HU", ko: "ko-KR" };
function speechVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === SPEECH_LANG[lang]) ?? voices.find((v) => v.lang.startsWith(lang)) ?? null;
}

/** Reading-speed estimate, used for captions-only playback and as a floor for scene length. */
const estimateMs = (text: string, lang: Lang) => Math.max(4500, text.length * (lang === "ko" ? 120 : 62));

/** Gameshow sting under the intro; the narration starts on its brass hit. */
const STING_SRC = "/explainer/sfx/intro-sting.mp3";
const STING_LEAD_MS = 1000;

/** 120 BPM minimal techno bed, looped under the narration. */
const MUSIC_SRC = "/explainer/sfx/music.mp3";
const MUSIC_VOLUME = 0.18;
const STING_VOLUME = 0.7;

const VOLUME_KEY = "msm:exVolume";
const clampVolume = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : 1);

// ------------------------------------------------------------------ player

export function Explainer({
  autoPlay = false,
  loop = false,
  tv = false,
}: {
  autoPlay?: boolean;
  /** Start again after the last scene (TV lobby). */
  loop?: boolean;
  /** TV sizing (viewport units) and muted-autoplay fallback. */
  tv?: boolean;
}) {
  const { t, lang } = useI18n();
  const [idx, setIdx] = useState(0);
  const [run, setRun] = useState(0); // bumps on every (re)start of a scene
  const [playing, setPlaying] = useState(autoPlay);
  const [started, setStarted] = useState(autoPlay);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [expected, setExpected] = useState(6000);
  const [files, setFiles] = useState<string[] | null>(null);
  /** Master volume (0..1) for narration, sting and music; remembered on this device. */
  const [volume, setVolume] = useState(() => clampVolume(load<number>(VOLUME_KEY, 1)));
  const volumeRef = useRef(volume);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stingRef = useRef<HTMLAudioElement | null>(null);
  const leadTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Narration waiting for the intro sting; started early if playback is paused and resumed. */
  const pendingVoice = useRef<(() => void) | null>(null);
  const narrationDone = useRef(false);
  /** Is a voice actually narrating this scene? Without one, pacing follows reading time. */
  const voiced = useRef(false);
  const elapsedRef = useRef(0);
  const text = t(narrationKey(idx));

  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && setFiles(m.files?.[lang] ?? []));
    return () => {
      alive = false;
    };
  }, [lang]);

  const stopNarration = useCallback(() => {
    clearTimeout(leadTimer.current);
    pendingVoice.current = null;
    stingRef.current?.pause();
    audioRef.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  // Start the current scene's narration whenever the scene (re)starts.
  useEffect(() => {
    if (!started || files === null) return;
    stopNarration();
    elapsedRef.current = 0;
    setElapsed(0);
    narrationDone.current = false;
    voiced.current = false;
    const estimate = estimateMs(text, lang);
    setExpected(estimate);
    if (muted || !playing) {
      narrationDone.current = muted;
      return;
    }
    const scene = SCENES[idx]!;
    const blocked = () => {
      // Browsers refuse sound without a click (e.g. on a TV): fall back to captions.
      setSoundBlocked(true);
      setMuted(true);
      voiced.current = false;
      narrationDone.current = true;
    };
    const lead = scene === "intro" ? STING_LEAD_MS : 0;
    const startVoice = () => {
      pendingVoice.current = null;
      if (files.includes(scene)) {
        const audio = (audioRef.current ??= new Audio());
        audio.volume = volumeRef.current;
        audio.src = `/explainer/${lang}/${scene}.mp3`;
        audio.onloadedmetadata = () => setExpected(Math.max(2500, lead + audio.duration * 1000 + 400));
        audio.onended = () => setTimeout(() => (narrationDone.current = true), 700); // short beat before the next scene
        audio.onerror = () => (narrationDone.current = true);
        audio.play().catch(blocked);
        return;
      }
      const voice = speechVoice(lang);
      if (!voice) {
        voiced.current = false;
        narrationDone.current = true; // captions only
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1;
      u.volume = volumeRef.current;
      u.onend = () => setTimeout(() => (narrationDone.current = true), 700);
      // Other speech errors (no audio device, synthesis failed): pace by reading time instead.
      u.onerror = (e) => (e.error === "not-allowed" ? blocked() : (voiced.current = false));
      speechSynthesis.speak(u);
    };
    voiced.current = files.includes(scene) || speechVoice(lang) !== null;
    if (!lead) return startVoice();
    // Intro: the gameshow sting plays first, the host comes in on its brass hit.
    setExpected(estimate + lead);
    const sting = (stingRef.current ??= new Audio(STING_SRC));
    sting.volume = STING_VOLUME * volumeRef.current;
    sting.currentTime = 0;
    sting.play().catch(blocked);
    pendingVoice.current = startVoice;
    leadTimer.current = setTimeout(startVoice, lead);
    // idx/run restart a scene; playing/muted are handled by their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, run, started, files, lang]);

  // Clock: advances only while playing; moves on when the narration and the minimum time are done.
  useEffect(() => {
    if (!playing || !started) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      setElapsed(elapsedRef.current);
      const e = elapsedRef.current;
      // Voiced: move on shortly after the voice finishes (safety cap if it never reports the end).
      // Captions only: give people the estimated reading time.
      const done = voiced.current ? (narrationDone.current && e >= 1800) || e >= expected + 4000 : e >= expected;
      if (done) {
        if (idx < SCENES.length - 1) {
          setIdx(idx + 1);
          setRun((r) => r + 1);
        } else if (loop) {
          setIdx(0);
          setRun((r) => r + 1);
        } else {
          setPlaying(false);
          setEnded(true);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, started, idx, expected, loop]);

  useEffect(() => () => stopNarration(), [stopNarration]);

  // Background music: loops quietly under the narration while the explainer plays with sound.
  const musicRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const on = started && playing && !muted && !ended;
    if (!on) {
      musicRef.current?.pause();
      return;
    }
    const music = (musicRef.current ??= Object.assign(new Audio(MUSIC_SRC), { loop: true }));
    music.volume = MUSIC_VOLUME * volumeRef.current;
    void music.play().catch(() => undefined);
  }, [started, playing, muted, ended]);
  // Restarting from the first scene restarts the track too.
  useEffect(() => {
    if (idx === 0 && musicRef.current) musicRef.current.currentTime = 0;
  }, [idx, run]);
  useEffect(() => () => musicRef.current?.pause(), []);

  const goTo = (i: number) => {
    setEnded(false);
    setStarted(true);
    setPlaying(true);
    setIdx(Math.max(0, Math.min(SCENES.length - 1, i)));
    setRun((r) => r + 1);
  };
  const togglePlay = () => {
    if (!started || ended) return goTo(ended ? 0 : idx);
    if (playing) {
      setPlaying(false);
      clearTimeout(leadTimer.current);
      stingRef.current?.pause();
      audioRef.current?.pause();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.pause();
    } else {
      setPlaying(true);
      if (pendingVoice.current && !muted) {
        void stingRef.current?.play().catch(() => undefined);
        pendingVoice.current();
        return;
      }
      if (audioRef.current && !narrationDone.current && !muted) void audioRef.current.play().catch(() => undefined);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.resume();
    }
  };
  /** Applies at once to whatever is playing; browser speech picks it up from the next line. */
  const changeVolume = (v: number) => {
    const next = clampVolume(v);
    setVolume(next);
    volumeRef.current = next;
    save(VOLUME_KEY, next);
    if (audioRef.current) audioRef.current.volume = next;
    if (stingRef.current) stingRef.current.volume = STING_VOLUME * next;
    if (musicRef.current) musicRef.current.volume = MUSIC_VOLUME * next;
    if (muted && next > 0) toggleMute(); // dragging the slider up turns sound back on
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundBlocked(false);
    if (next) {
      stopNarration();
      narrationDone.current = true;
    } else {
      goTo(idx); // replay this scene with sound
    }
  };

  const p = Math.min(1, elapsed / expected);
  return (
    <div className={`ex${tv ? " ex-tv" : ""}${playing ? "" : " ex-paused"}`}>
      <div className="ex-stage" key={`${idx}-${run}`}>
        <Scene id={SCENES[idx]!} p={started ? p : 0} />
        {/* Inside the stage so it sits in the middle of the picture, not of the whole player. */}
        {!started && (
          <button className="ex-bigplay" onClick={() => goTo(0)} aria-label={t("ex.play")}>
            ▶
          </button>
        )}
      </div>
      <p className="ex-caption" aria-live="polite">
        {text}
      </p>
      {ended && (
        <div className="ex-overlay">
          <span>{t("ex.ended")}</span>
          <button className="btn btn-primary" onClick={() => goTo(0)}>
            ⟲ {t("ex.restart")}
          </button>
        </div>
      )}
      {soundBlocked && !tv && (
        <button className="chip chip-warning ex-sound" onClick={toggleMute}>
          {t("ex.soundBlocked")}
        </button>
      )}
      {!tv && (
        <div className="ex-controls">
          <button
            className="btn btn-sm icon-btn"
            onClick={() => goTo(0)}
            aria-label={t("ex.restart")}
            title={t("ex.restart")}
          >
            ⟲
          </button>
          <button
            className="btn btn-sm icon-btn"
            onClick={() => goTo(idx - 1)}
            aria-label={t("ex.prev")}
            title={t("ex.prev")}
          >
            ⏮
          </button>
          <button
            className="btn btn-sm btn-primary icon-btn"
            onClick={togglePlay}
            aria-label={playing ? t("ex.pause") : t("ex.play")}
            title={playing ? t("ex.pause") : t("ex.play")}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            className="btn btn-sm icon-btn"
            onClick={() => goTo(idx + 1)}
            aria-label={t("ex.next")}
            title={t("ex.next")}
          >
            ⏭
          </button>
          <div className="ex-progress" role="group" aria-label={t("ex.title")}>
            {SCENES.map((s, i) => (
              <button
                key={s}
                className="ex-seg"
                onClick={() => goTo(i)}
                aria-label={`${i + 1}/${SCENES.length}`}
                style={{ ["--fill" as string]: i < idx ? 1 : i === idx ? (started ? p : 0) : 0 }}
              />
            ))}
          </div>
          <button
            className="btn btn-sm icon-btn"
            onClick={toggleMute}
            aria-label={muted ? t("ex.unmute") : t("ex.mute")}
            title={muted ? t("ex.unmute") : t("ex.mute")}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <input
            type="range"
            className="ex-volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label={t("ex.volume")}
            title={`${t("ex.volume")}: ${Math.round((muted ? 0 : volume) * 100)}%`}
          />
        </div>
      )}
      {tv && (
        <div className="ex-progress ex-progress-tv" aria-hidden="true">
          {SCENES.map((s, i) => (
            <span key={s} className="ex-seg" style={{ ["--fill" as string]: i < idx ? 1 : i === idx ? p : 0 }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ scenes (driven by p: 0..1 of the scene)

const step = (p: number, at: number) => p >= at;

function Scene({ id, p }: { id: SceneId; p: number }) {
  switch (id) {
    case "intro":
      return <SceneIntro />;
    case "market":
      return <SceneMarket p={p} />;
    case "trade":
      return <SceneTrade p={p} />;
    case "settle":
      return <SceneSettle p={p} />;
    case "rules":
      return <SceneRules p={p} />;
    case "clues":
      return <SceneClues p={p} />;
    case "secret":
      return <SceneSecret p={p} />;
    case "pieces":
      return <ScenePieces p={p} />;
    case "ready":
      return <SceneReady p={p} />;
    case "end":
      return <SceneEnd />;
  }
}

function SceneIntro() {
  const { t } = useI18n();
  return (
    <div className="ex-center">
      <div className="ex-pop">
        <LogoMark shape={logoShape(SHOW_LOGO)} size={96} />
      </div>
      <h2 className="ex-title ex-rise">{t("app.name")}</h2>
      <span className="overline ex-rise ex-d2">{t("ex.tagline")}</span>
    </div>
  );
}

function SceneMarket({ p }: { p: number }) {
  const { money, stock, t } = useI18n();
  return (
    <div className="ex-center" style={{ gap: "var(--ex-gap)" }}>
      <div className="ex-grid">
        {STOCK_IDS.map((_, i) => (
          <div key={i} className="panel ex-tile ex-pop" style={{ animationDelay: `${i * 90}ms` }}>
            <CompanyLogo i={i} size="2.2em" />
            <span className="ex-tile-name">{stock(i)}</span>
            <span className="num">{money(10_000)}</span>
          </div>
        ))}
      </div>
      {step(p, 0.45) && (
        <div className="row ex-rise" style={{ gap: "1.2em" }}>
          <span className="ex-big num">{money(100_000)}</span>
          <span className="row" style={{ gap: 6 }}>
            {[0, 1, 2].map((k) => (
              <span key={k} className="ex-pip" />
            ))}
          </span>
          <span className="muted">{t("desk.pieces")}</span>
        </div>
      )}
    </div>
  );
}

function SceneTrade({ p }: { p: number }) {
  const { money, stock, t } = useI18n();
  const bought = step(p, 0.45);
  return (
    <div className="ex-center">
      <div className="card ex-card">
        <div className="row-between">
          <span className="row" style={{ gap: 10 }}>
            <CompanyLogo i={0} size="2em" />
            <b>{stock(0)}</b>
          </span>
          <span className="num ex-big">{money(10_000)}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="ex-qty num">3</span>
          <span className={`btn btn-primary ex-press${bought ? " is-pressed" : ""}`}>{t("stock.buy")}</span>
          <span className="btn">{t("stock.sell")}</span>
        </div>
        <div className="row-between muted">
          <span>{t("stock.position", { n: bought ? 3 : 0 })}</span>
          <span className="num">
            {t("desk.cash")}: {money(bought ? 70_000 : 100_000)}
          </span>
        </div>
      </div>
      <span className="chip ex-rise ex-d3">{t("ex.frozenChip")}</span>
    </div>
  );
}

const SETTLE_TO = [11_300, 9_300, 9_000, 10_400, 11_000, 10_000, 11_800];

function SceneSettle({ p }: { p: number }) {
  const { money, stock } = useI18n();
  const moved = step(p, 0.35);
  return (
    <div className="ex-grid">
      {STOCK_IDS.map((_, i) => {
        const to = SETTLE_TO[i]!;
        return (
          <div key={i} className={`panel ex-tile${moved ? " ex-flash" : ""}`}>
            <CompanyLogo i={i} size="2.2em" />
            <span className="ex-tile-name">{stock(i)}</span>
            <span className="num ex-big">{money(moved ? to : 10_000)}</span>
            {moved ? <Delta value={to - 10_000} /> : <span className="delta muted">–</span>}
          </div>
        );
      })}
    </div>
  );
}

/** A real rule's tokens (CoyoTech, show rules), revealed group by group. */
function demoRule(lang: Lang): { g: number; text: string }[] {
  const parts: Record<Lang, [number, string][]> = {
    en: [
      [0, "If"],
      [1, "this stock's buy volume"],
      [2, "beats Latter Electronics'"],
      [0, "this round:"],
      [3, "+ℳ1,400."],
      [0, "Otherwise:"],
      [4, "−ℳ700."],
    ],
    hu: [
      [0, "Ha"],
      [1, "ennek a részvénynek a vételi volumene"],
      [0, "ebben a körben"],
      [2, "meghaladja a Latter Elektronika vételi volumenét:"],
      [3, "+1400 ℳ."],
      [0, "Különben:"],
      [4, "−700 ℳ."],
    ],
    ko: [
      [0, "이번 라운드에"],
      [1, "이 종목의 매수량이"],
      [2, "래터 전자의 매수량보다 많으면:"],
      [3, "+ℳ1,400."],
      [0, "아니면:"],
      [4, "−ℳ700."],
    ],
  };
  return parts[lang].map(([g, text]) => ({ g, text }));
}

function SceneRules({ p }: { p: number }) {
  const { lang, stock, t } = useI18n();
  const level = p < 0.2 ? 0 : p < 0.4 ? 1 : p < 0.6 ? 2 : p < 0.8 ? 3 : 4;
  const tokens: RuleToken[] = demoRule(lang).map((tok) =>
    tok.g <= level ? tok : { g: tok.g, len: [...tok.text].length },
  );
  const roundLabel = ["R1", "R5", "R10", "R15", "R20"][level]!;
  return (
    <div className="ex-center">
      <div className="card ex-card ex-wide">
        <div className="row-between">
          <span className="row" style={{ gap: 10 }}>
            <CompanyLogo i={1} size="2em" />
            <b>{stock(1)}</b>
          </span>
          <span className="chip chip-warning">
            {t("game.round")} {roundLabel}
          </span>
        </div>
        <RuleText tokens={tokens} publicLevel={level} className="rule ex-rule" />
      </div>
    </div>
  );
}

function SceneClues({ p }: { p: number }) {
  const { num, stock, t } = useI18n();
  const rows = [
    [0, 6, 1, 14],
    [1, 9, 0, 21],
    [2, 2, 5, 8],
  ] as const;
  return (
    <div className="ex-center">
      <div className="card ex-card ex-wide">
        <span className="overline">{t("stock.lastRound")}</span>
        {rows.map(([i, buy, sell, hold], k) =>
          step(p, 0.1 + k * 0.18) ? (
            <div key={i} className="row-between ex-rise">
              <span className="row" style={{ gap: 10 }}>
                <CompanyLogo i={i} size="1.8em" />
                {stock(i)}
              </span>
              <span className="stats" style={{ fontSize: "1em" }}>
                <span>
                  {t("stock.buyVol")} <b>{num(buy)}</b>
                </span>
                <span>
                  {t("stock.sellVol")} <b>{num(sell)}</b>
                </span>
                <span>
                  {t("stock.holdings")} <b>{num(hold)}</b>
                </span>
              </span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function SceneSecret({ p }: { p: number }) {
  const { money, stock, t } = useI18n();
  const hidden = step(p, 0.3);
  const blind = step(p, 0.7);
  return (
    <div className="ex-center" style={{ gap: "var(--ex-gap)" }}>
      <div className={`card ex-card${hidden ? " ex-flash" : ""}`}>
        <div className="row-between">
          <span className="row" style={{ gap: 10 }}>
            <CompanyLogo i={2} size="2em" />
            <b>{stock(2)}</b>
            {hidden && <span className="chip chip-sm chip-warning">{t("stock.hidden")}</span>}
          </span>
          <span className={`num ex-big${hidden ? " unknown" : ""}`}>{hidden ? "???" : money(9_000)}</span>
        </div>
      </div>
      {blind && (
        <div className="card ex-card ex-rise">
          <div className="row-between">
            <span className="overline">{t("desk.cash")}</span>
            <span className="num ex-big unknown">???</span>
          </div>
          <span className="muted">{t("stock.youHold", { n: 4 })}</span>
        </div>
      )}
    </div>
  );
}

function ScenePieces({ p }: { p: number }) {
  const { money, t } = useI18n();
  const cashed = step(p, 0.3);
  const peeked = step(p, 0.65);
  return (
    <div className="ex-center" style={{ gap: "var(--ex-gap)" }}>
      <div className="row" style={{ gap: 14 }}>
        {[0, 1, 2].map((k) => (
          <span
            key={k}
            className={`ex-pip ex-pip-lg${(k === 0 && cashed) || (k === 1 && peeked) ? " is-spent" : ""}`}
          />
        ))}
      </div>
      <div className="row wrap" style={{ gap: "1.2em", justifyContent: "center" }}>
        {cashed && (
          <span className="chip chip-success ex-pop ex-chip-lg">
            <IconCash size={20} /> +{money(10_000)}
          </span>
        )}
        {peeked && (
          <span className="chip ex-pop ex-chip-lg">
            <IconPeek size={20} /> {t("desk.peek")}
          </span>
        )}
      </div>
      <span className="muted">{t("desk.piecesClosed")}</span>
    </div>
  );
}

function SceneReady({ p }: { p: number }) {
  const { t } = useI18n();
  const ready = step(p, 0.4);
  const settling = step(p, 0.75);
  return (
    <div className="ex-center">
      <span className={`btn btn-ready ready-big ex-ready${ready ? " is-ready" : ""}`}>
        <span className="row" style={{ gap: 8 }}>
          {ready && <IconCheck size={20} />}
          {ready ? t("game.readyDone") : t("game.readyBig")}
        </span>
        <span className="ready-caption">
          {settling
            ? t("game.settlingIn", { s: 3 })
            : ready
              ? t("game.readyWaiting", { n: 2, total: 3 })
              : t("game.readyHintEnds")}
        </span>
      </span>
    </div>
  );
}

function SceneEnd() {
  const { money, t } = useI18n();
  const rows = [
    { name: "Ada", net: 412_000, h: "8em", place: 2 },
    { name: t("common.you"), net: 538_000, h: "11em", place: 1 },
    { name: "Bram", net: 297_000, h: "6em", place: 3 },
  ];
  return (
    <div className="ex-center">
      <div className="podium" style={{ width: "min(100%, 30em)" }}>
        {rows.map((r, i) => (
          <div key={r.name} className="podium-step ex-rise" style={{ minHeight: r.h, animationDelay: `${i * 150}ms` }}>
            <div className="place">{r.place}</div>
            <div>{r.name}</div>
            <div className="num small muted">{money(r.net, { compact: true })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
