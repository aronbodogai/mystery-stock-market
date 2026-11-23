import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, pairWithHost, roomInfo } from "../api";
import { Nav } from "../components/common";
import { useI18n } from "../i18n";
import { hostedRooms } from "../storage";

/** /pair/:pairCode — the TV's QR points here. Only a phone that hosts a room can confirm. */
export function PairPage() {
  const { pairCode = "" } = useParams();
  const { t, code: tc } = useI18n();
  const [room, setRoom] = useState<{ code: string; hostToken: string } | null | undefined>(undefined);
  const [state, setState] = useState<"idle" | "busy" | "done" | { error: string }>("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of hostedRooms()) {
        try {
          const info = await roomInfo(r.code);
          if (info.exists) {
            if (!cancelled) setRoom(r);
            return;
          }
        } catch {
          /* try next */
        }
      }
      if (!cancelled) setRoom(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = async () => {
    if (!room) return;
    setState("busy");
    try {
      await pairWithHost(room.code, room.hostToken, pairCode);
      setState("done");
    } catch (e) {
      setState({ error: e instanceof ApiError ? e.code : "network" });
    }
  };

  return (
    <>
      <Nav />
      <main className="container page narrow stack">
        {room === undefined && <p className="muted">{t("conn.connecting")}</p>}
        {room === null && (
          <div className="card card-pad stack">
            <h2>{t("pair.onlyHost")}</h2>
            <p className="muted" style={{ margin: 0 }}>{t("pair.onlyHostBody")}</p>
            <Link to="/" className="btn">{t("common.home")}</Link>
          </div>
        )}
        {room && state !== "done" && (
          <div className="card card-pad stack">
            <span className="overline">{t("pair.overline")}</span>
            <h2>{t("pair.confirm", { code: room.code })}</h2>
            <p className="muted mono" style={{ margin: 0 }}>{`${pairCode.slice(0, 3)} ${pairCode.slice(3)}`}</p>
            {typeof state === "object" && <span className="small" style={{ color: "var(--error)" }}>{tc("err", state.error)}</span>}
            <div className="row">
              <button className="btn btn-primary" disabled={state === "busy"} onClick={confirm}>
                {t("pair.show")}
              </button>
              <Link to={`/r/${room.code}`} className="btn">{t("common.cancel")}</Link>
            </div>
          </div>
        )}
        {room && state === "done" && (
          <div className="card card-pad stack">
            <h2>{t("pair.done")}</h2>
            <Link to={`/r/${room.code}`} className="btn btn-primary">{t("pair.back")}</Link>
          </div>
        )}
      </main>
    </>
  );
}
