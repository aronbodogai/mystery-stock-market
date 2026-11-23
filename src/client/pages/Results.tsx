import type { ClientMsg, Results as ResultsT, View } from "../../shared/protocol";
import { CompanyLogo } from "../components/CompanyLogo";
import { Sparkline } from "../components/Sparkline";
import { useI18n } from "../i18n";

export function Podium({ results, big = false }: { results: ResultsT; big?: boolean }) {
  const { money } = useI18n();
  const top = results.ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const heights = [big ? "22vh" : "96px", big ? "30vh" : "132px", big ? "16vh" : "72px"];
  return (
    <div className="podium">
      {order.map((row, i) =>
        row ? (
          <div key={row.id} className="podium-step" style={{ minHeight: heights[i] }}>
            <div className="place">{row.rank}</div>
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: big ? "1.6vw" : 15,
              }}
            >
              {row.name}
            </div>
            <div className="num small muted">{money(row.net, { compact: true })}</div>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}

export function RankingList({ results }: { results: ResultsT }) {
  const { t, money, tp } = useI18n();
  return (
    <div className="divided">
      {results.ranking.map((r) => (
        <div className="list-row" key={r.id}>
          <div className="row grow wrap" style={{ minWidth: 0 }}>
            <span className="num muted" style={{ width: 22 }}>
              {r.rank}
            </span>
            <span>{r.name}</span>
            {r.me && <span className="badge">{t("common.you")}</span>}
            {r.bot && <span className="badge">{t("common.bot")}</span>}
            {r.pieces > 0 && <span className="chip chip-sm">{tp("results.piecesEarned", r.pieces)}</span>}
            {r.prize && <span className="chip chip-sm chip-active">{t("results.prize")}</span>}
          </div>
          <span className="num">{money(r.net)}</span>
        </div>
      ))}
    </div>
  );
}

export function AllRules({ results, compact = false }: { results: ResultsT; compact?: boolean }) {
  const { stock } = useI18n();
  return (
    <div className="stack-sm" style={{ gap: compact ? 6 : 12 }}>
      {results.rules.map((tokens, i) => (
        <div key={i} className={compact ? "" : "panel"} style={compact ? undefined : { padding: 12 }}>
          <div className="row-between">
            <span className="row" style={{ gap: compact ? "0.6vw" : 10 }}>
              <CompanyLogo i={i} size={compact ? "1.9vw" : 28} />
              <span className="stock-name" style={{ fontSize: compact ? "1.1vw" : 15 }}>
                {stock(i)}
              </span>
            </span>
            {!compact && (
              <div style={{ width: 120 }}>
                <Sparkline points={results.history.map((h) => h[i]!)} width={120} height={28} />
              </div>
            )}
          </div>
          <p className="rule" style={{ margin: 0, fontSize: compact ? "0.95vw" : 14, lineHeight: 1.6 }}>
            {tokens.map((tok) => tok.text).join(" ")}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ResultsView({ view, send }: { view: View; send: (m: ClientMsg) => boolean }) {
  const { t } = useI18n();
  const res = view.results;
  if (!res) return null;
  const isHost = view.you.role === "host";
  // PCs: standings on the left, every rule on the right.
  return (
    <div className="two-col">
      <div className="stack" style={{ gap: 20 }}>
        <div className="stack-sm">
          <span className="overline">{t("results.overline")}</span>
          <h2 style={{ fontSize: 32 }}>{t("results.title")}</h2>
        </div>
        <Podium results={res} />
        <div className="card">
          <RankingList results={res} />
        </div>
        {isHost && (
          <button className="btn btn-primary btn-lg" onClick={() => send({ type: "newGame" })}>
            {t("results.newGame")}
          </button>
        )}
      </div>
      <div className="card card-pad stack">
        <h3>{t("results.rules")}</h3>
        <AllRules results={res} />
        <div className="small muted">
          {t("results.seed")} <span className="mono">{res.seed}</span> ·{" "}
          {t(res.ruleSet === "show" ? "set.ruleShow" : "set.ruleRandom")}
        </div>
      </div>
    </div>
  );
}
