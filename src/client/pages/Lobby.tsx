import { useState, type FormEvent } from "react";
import { MAX_SEATS } from "../../engine/constants";
import { LANGS } from "../../shared/lang";
import { GAME_MAX_MS, ROUND_SECONDS, type RoundSeconds } from "../../engine/room";
import type { ClientMsg, View } from "../../shared/protocol";
import { IconTv } from "../components/icons";
import { QR } from "../components/QR";
import { useI18n } from "../i18n";

export function joinUrl(view: View): string {
  return `${view.origin}/j/${view.code}`;
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
  render,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string;
  render: (v: T) => string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function PlayerList({ view, isHost, send }: { view: View; isHost: boolean; send: (m: ClientMsg) => boolean }) {
  const { t } = useI18n();
  return (
    <div className="divided">
      {view.lobby.map((p) => (
        <div className="list-row" key={p.id}>
          <div className="row grow" style={{ minWidth: 0 }}>
            <span
              className={`dot${p.connected ? " on" : ""}`}
              title={p.connected ? t("lobby.online") : t("lobby.offline")}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            {p.me && <span className="badge">{t("common.you")}</span>}
            {p.host && <span className="badge">{t("common.host")}</span>}
            {p.bot && <span className="badge">{t("common.bot")}</span>}
            {!p.seated && <span className="chip chip-sm">{t("lobby.notPlaying")}</span>}
          </div>
          {isHost && !p.host && view.phase === "lobby" && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => send(p.bot ? { type: "removeBot", playerId: p.id } : { type: "kick", playerId: p.id })}
            >
              {p.bot ? t("lobby.removeBot") : t("lobby.kick")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Host: type the 6-digit code shown on a TV. Works in the lobby and at any point during the game. */
export function ConnectTv({ send }: { send: (m: ClientMsg) => boolean }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) return setInvalid(true);
    if (send({ type: "pairTv", pairCode: digits })) setCode("");
  };
  return (
    <form className="stack-sm" onSubmit={onSubmit}>
      <div className="row">
        <input
          className={`input mono${invalid ? " invalid" : ""}`}
          inputMode="numeric"
          autoComplete="off"
          placeholder="123 456"
          aria-label={t("tv.pairCode")}
          value={code}
          maxLength={7}
          onChange={(e) => {
            setCode(e.target.value.replace(/[^\d ]/g, ""));
            setInvalid(false);
          }}
        />
        <button className="btn">
          <IconTv size={16} />
          {t("host.connectTv")}
        </button>
      </div>
      {invalid && (
        <span className="small" style={{ color: "var(--error)" }}>
          {t("host.tvCodeHint")}
        </span>
      )}
    </form>
  );
}

export function Lobby({ view, send }: { view: View; send: (m: ClientMsg) => boolean }) {
  const { t, tp } = useI18n();
  const roundLabel = (s: number) => (s === 0 ? t("set.noLimit") : t("set.seconds", { n: s }));
  const isHost = view.you.role === "host";
  const c = view.config;
  const set = (config: Partial<typeof c>) => send({ type: "setConfig", config });
  const bots = view.lobby.filter((p) => p.bot).length;
  const humans = view.lobby.length - bots;
  const url = joinUrl(view);
  const [copied, setCopied] = useState(false);
  const canStart = view.seats.count >= view.seats.min && view.seats.count <= view.seats.max;

  // PCs: join card + players on the left, settings on the right.
  return (
    <div className="two-col">
      <div className="stack" style={{ gap: 20 }}>
        <div className="card card-pad">
          <div className="row wrap" style={{ gap: 24, alignItems: "center" }}>
            <QR value={url} size={148} label={t("lobby.scanToJoin")} />
            <div className="stack-sm grow">
              <span className="overline">{t("lobby.roomCode")}</span>
              <div className="mono" style={{ fontSize: 40, letterSpacing: "0.12em", lineHeight: 1 }}>
                {view.code}
              </div>
              <div className="small muted" style={{ wordBreak: "break-all" }}>
                {url}
              </div>
              <div className="row wrap">
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? t("lobby.copied") : t("lobby.copyLink")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-pad row-between" style={{ paddingBottom: 12 }}>
            <h3>{t("lobby.players")}</h3>
            <span className="chip">{t("lobby.seats", { n: view.seats.count, max: view.seats.max })}</span>
          </div>
          <PlayerList view={view} isHost={isHost} send={send} />
        </div>
      </div>

      {isHost ? (
        <div className="card card-pad stack">
          <h3>{t("lobby.settings")}</h3>
          {/* One language for everyone once the game starts: phones, the TV and the rule text. */}
          <div className="stack-sm">
            <span className="small muted">{t("set.gameLang")}</span>
            <Seg
              label={t("set.gameLang")}
              value={c.lang}
              options={LANGS}
              onChange={(v) => set({ lang: v })}
              render={(l) => t(`lang.${l}`)}
            />
            <span className="caption">{t("set.gameLangHint")}</span>
          </div>
          <div className="stack-sm">
            <span className="small muted">{t("set.ruleSet")}</span>
            <Seg
              label={t("set.ruleSet")}
              value={c.ruleSet}
              options={["show", "random"] as const}
              onChange={(v) => set({ ruleSet: v })}
              render={(v) => t(v === "show" ? "set.ruleShow" : "set.ruleRandom")}
            />
          </div>
          <div className="stack-sm">
            <span className="small muted">{t("set.roundLength")}</span>
            <Seg
              label={t("set.roundLength")}
              value={c.roundSeconds}
              options={ROUND_SECONDS}
              onChange={(v: RoundSeconds) => set({ roundSeconds: v })}
              render={(v) => roundLabel(v)}
            />
            {c.roundSeconds === 0 && <span className="caption">{t("set.noLimitHint")}</span>}
          </div>
          {/* With no limit, rounds always end when everyone is ready. */}
          <label className="row" style={{ gap: 10, opacity: c.roundSeconds === 0 ? 0.5 : 1 }}>
            <input
              type="checkbox"
              className="check"
              checked={c.endEarly || c.roundSeconds === 0}
              disabled={c.roundSeconds === 0}
              onChange={(e) => set({ endEarly: e.target.checked })}
            />
            <span>{t("set.endEarly")}</span>
          </label>
          <label className="row" style={{ gap: 10 }}>
            <input
              type="checkbox"
              className="check"
              checked={c.hostPlays}
              onChange={(e) => set({ hostPlays: e.target.checked })}
            />
            <span>{t("set.hostPlays")}</span>
          </label>
          <div className="row-between wrap">
            <div className="stack-sm">
              <span className="small muted">{tp("set.bots", bots)}</span>
              <div className="row">
                <button
                  className="btn btn-sm"
                  onClick={() => send({ type: "removeBot" })}
                  disabled={bots === 0}
                  aria-label={t("lobby.removeBot")}
                >
                  −
                </button>
                <span className="num" style={{ minWidth: 24, textAlign: "center" }}>
                  {bots}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => send({ type: "addBot" })}
                  disabled={view.seats.count >= MAX_SEATS}
                  aria-label={t("lobby.addBot")}
                >
                  +
                </button>
              </div>
            </div>
            <div className="stack-sm">
              <span className="small muted">{t("set.botSkill")}</span>
              <Seg
                label={t("set.botSkill")}
                value={c.botSkill}
                options={["easy", "normal", "hard"] as const}
                onChange={(v) => set({ botSkill: v })}
                render={(v) => t(`skill.${v}`)}
              />
            </div>
          </div>
          <label className="field">
            {t("set.seed")}
            <input
              className="input mono"
              placeholder={t("set.seedPlaceholder")}
              defaultValue={c.seed}
              maxLength={64}
              onBlur={(e) => e.target.value !== c.seed && set({ seed: e.target.value })}
            />
          </label>
          <div className="stack-sm">
            <span className="small muted">{t("host.tvs")}</span>
            <ConnectTv send={send} />
            {view.host && view.host.displays.length > 0 && (
              <span className="small muted">{tp("host.tvCount", view.host.displays.length)}</span>
            )}
          </div>
          <button className="btn btn-primary btn-lg" disabled={!canStart} onClick={() => send({ type: "start" })}>
            {t("lobby.start")}
          </button>
          {!canStart && <span className="small muted">{t("lobby.needPlayers", { min: view.seats.min })}</span>}
          <span className="caption">
            {tp("lobby.humans", humans)} · {t("set.gameCap", { hours: GAME_MAX_MS / 3_600_000 })}
          </span>
        </div>
      ) : (
        <div className="card card-pad stack-sm">
          <h3>{t("lobby.waiting")}</h3>
          <div className="row wrap">
            <span className="chip">{t(c.ruleSet === "show" ? "set.ruleShow" : "set.ruleRandom")}</span>
            <span className="chip">{roundLabel(c.roundSeconds)}</span>
            {bots > 0 && (
              <span className="chip">
                {tp("set.bots", bots)} · {t(`skill.${c.botSkill}`)}
              </span>
            )}
            {c.endEarly && <span className="chip">{t("set.endEarlyShort")}</span>}
            <span className="chip">{t("set.gameLangChip", { lang: t(`lang.${c.lang}`) })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
