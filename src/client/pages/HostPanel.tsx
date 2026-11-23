import { useState } from "react";
import type { ClientMsg, View } from "../../shared/protocol";
import { Sheet } from "../components/common";
import { useI18n } from "../i18n";
import { ConnectTv } from "./Lobby";

/** Connect / list / unpair TVs. Available to the host in the lobby and during the game. */
export function TvControls({ view, send }: { view: View; send: (m: ClientMsg) => boolean }) {
  const { t, tp } = useI18n();
  return (
    <div className="stack-sm">
      <span className="overline">{t("host.tvs")}</span>
      <ConnectTv send={send} />
      <p className="caption" style={{ margin: 0 }}>
        {t("host.tvHint", { url: `${view.origin.replace(/^https?:\/\//, "")}/tv` })}
      </p>
      {view.host && view.host.displays.length > 0 && (
        <div className="panel divided">
          {view.host.displays.map((d, i) => (
            <div key={d.id} className="list-row">
              <span>{t("host.tvName", { n: i + 1 })}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => send({ type: "unpairTv", displayId: d.id })}>
                {t("host.unpair")}
              </button>
            </div>
          ))}
        </div>
      )}
      {view.host && view.host.spectators > 0 && (
        <span className="small muted">{tp("host.spectators", view.host.spectators)}</span>
      )}
    </div>
  );
}

export function HostPanel({
  view,
  send,
  open,
  onClose,
  onPrefs,
}: {
  view: View;
  send: (m: ClientMsg) => boolean;
  open: boolean;
  onClose: () => void;
  onPrefs: () => void;
}) {
  const { t } = useI18n();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const inGame = view.phase === "trading" || view.phase === "paused" || view.phase === "countdown";
  const humans = view.lobby.filter((p) => !p.bot && !p.host);
  return (
    <Sheet open={open} onClose={onClose} title={t("host.title")}>
      <div className="stack">
        {inGame && (
          <div className="stack-sm">
            <span className="overline">{t("host.round")}</span>
            <div className="row wrap">
              {view.phase === "paused" ? (
                <button className="btn" onClick={() => send({ type: "resume" })}>
                  {t("host.resume")}
                </button>
              ) : (
                <button className="btn" disabled={view.phase !== "trading"} onClick={() => send({ type: "pause" })}>
                  {t("host.pause")}
                </button>
              )}
              <button className="btn" disabled={view.phase === "countdown"} onClick={() => send({ type: "endRound" })}>
                {t("host.endRound")}
              </button>
              {confirmEnd ? (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      send({ type: "endGame" });
                      setConfirmEnd(false);
                      onClose();
                    }}
                  >
                    {t("host.endGameConfirm")}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={() => setConfirmEnd(true)}>
                  {t("host.endGame")}
                </button>
              )}
            </div>
          </div>
        )}

        <TvControls view={view} send={send} />

        <div className="stack-sm">
          <span className="overline">{t("host.players")}</span>
          {humans.length === 0 && <span className="small muted">{t("host.noPlayers")}</span>}
          <div className="panel divided">
            {humans.map((p) => (
              <div key={p.id} className="list-row">
                <span className="row grow" style={{ minWidth: 0 }}>
                  <span className={`dot${p.connected ? " on" : ""}`} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </span>
                <span className="row">
                  <button className="btn btn-ghost btn-sm" onClick={() => send({ type: "transferHost", playerId: p.id })}>
                    {t("host.makeHost")}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => send({ type: "kick", playerId: p.id })}>
                    {t("lobby.kick")}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn"
          onClick={() => {
            onClose();
            onPrefs();
          }}
        >
          {t("common.settings")}
        </button>
      </div>
    </Sheet>
  );
}
