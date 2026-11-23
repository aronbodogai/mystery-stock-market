import { CURRENCY } from "../../shared/currency";
import { Explainer } from "../components/Explainer";
import { useI18n } from "../i18n";

export function HowToPlay({ titleId }: { titleId?: string } = {}) {
  const { t, money } = useI18n();
  const p = {
    symbol: CURRENCY.symbol,
    start: money(10_000),
    cash: money(100_000),
    floor: money(100),
    piece: money(10_000),
    example: money(10_000),
  };
  const items = [
    t("how.currency", p),
    t("how.basics", p),
    t("how.rounds", p),
    t("how.rules", p),
    t("how.secret", p),
    t("how.pieces", p),
    t("how.end", p),
    t("how.bots", p),
  ];
  return (
    <div className="stack">
      <h2 id={titleId} style={{ fontSize: 32 }}>
        {t("how.title")}
      </h2>
      {/* The video comes first, as wide as the page content, and waits paused; its big play button starts it with sound. */}
      <Explainer />
      <ol className="stack-sm" style={{ margin: 0, paddingLeft: 20, maxWidth: 760 }}>
        {items.map((s, i) => (
          <li key={i} style={{ paddingLeft: 4 }}>
            {s}
          </li>
        ))}
      </ol>
      <p className="caption" style={{ margin: 0, maxWidth: 760 }}>
        {t("how.credit")}
      </p>
    </div>
  );
}
