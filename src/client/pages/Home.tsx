import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STOCK_IDS } from "../../engine/constants";
import { cleanName } from "../../shared/names";
import { ApiError, createRoom, roomInfo } from "../api";
import { Nav } from "../components/common";
import { CompanyLogo } from "../components/CompanyLogo";
import { DotGrid } from "../components/DotGrid";
import { useI18n } from "../i18n";
import { setCreds } from "../storage";
import { HowToPlay } from "./HowToPlay";

export function Home() {
  const { t, lang, code: tc, stock } = useI18n();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<{ where: "create" | "join"; code: string } | null>(null);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) return setError({ where: "create", code: "bad_name" });
    setBusy("create");
    setError(null);
    try {
      const res = await createRoom(clean, lang);
      setCreds(res.code, { token: res.playerToken, hostToken: res.hostToken });
      nav(`/r/${res.code}`);
    } catch (err) {
      setError({ where: "create", code: err instanceof ApiError ? err.code : "network" });
    } finally {
      setBusy(null);
    }
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return setError({ where: "join", code: "bad_code" });
    setBusy("join");
    setError(null);
    try {
      const info = await roomInfo(code);
      if (!info.exists) setError({ where: "join", code: "not_found" });
      else nav(`/j/${code}`);
    } catch (err) {
      setError({ where: "join", code: err instanceof ApiError ? err.code : "network" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Nav
        right={
          <Link className="btn btn-ghost btn-sm" to="/tv">
            {t("home.tvLink")}
          </Link>
        }
      />
      <section className="hero">
        <DotGrid />
        <div className="container">
          <div className="stack" style={{ maxWidth: 760, gap: 20 }}>
            <span className="overline">{t("home.overline")}</span>
            <h1>{t("app.name")}</h1>
            <p className="muted" style={{ fontSize: 17, maxWidth: 560, margin: 0 }}>
              {t("home.tagline")}
            </p>
          </div>
        </div>
      </section>

      <main className="container page" style={{ paddingTop: 0 }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <form className="card card-pad stack" onSubmit={onCreate}>
            <div className="stack-sm">
              <h2>{t("home.createTitle")}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {t("home.createBody")}
              </p>
            </div>
            <label className="field">
              {t("join.nameLabel")}
              <input
                className={`input${error?.where === "create" ? " invalid" : ""}`}
                value={name}
                maxLength={32}
                autoComplete="nickname"
                placeholder={t("join.namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {error?.where === "create" && (
              <div className="small" style={{ color: "var(--error)" }}>
                {tc("err", error.code)}
              </div>
            )}
            <button className="btn btn-primary btn-lg" disabled={busy !== null}>
              {busy === "create" ? t("common.working") : t("home.create")}
            </button>
          </form>

          <form className="card card-pad stack" onSubmit={onJoin}>
            <div className="stack-sm">
              <h2>{t("home.joinTitle")}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {t("home.joinBody")}
              </p>
            </div>
            <label className="field">
              {t("home.codeLabel")}
              <input
                className={`input input-code${error?.where === "join" ? " invalid" : ""}`}
                value={roomCode}
                maxLength={5}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCDE"
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
            </label>
            {error?.where === "join" && (
              <div className="small" style={{ color: "var(--error)" }}>
                {tc("err", error.code)}
              </div>
            )}
            <button className="btn btn-lg" disabled={busy !== null}>
              {busy === "join" ? t("common.working") : t("home.join")}
            </button>
          </form>
        </div>

        <div className="row wrap" style={{ marginTop: 20, gap: 12 }}>
          <Link to="/tv" className="btn btn-sm">
            {t("home.tvLink")}
          </Link>
          <Link to="/solo" className="btn btn-sm">
            {t("home.solo")}
          </Link>
        </div>

        <section className="stack" style={{ marginTop: 56 }}>
          <h2>{t("home.companies")}</h2>
          <div className="companies">
            {STOCK_IDS.map((_, i) => (
              <div key={i} className="panel company">
                <CompanyLogo i={i} size={36} />
                <span>{stock(i)}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 56 }}>
          <HowToPlay />
        </section>
      </main>
    </>
  );
}
