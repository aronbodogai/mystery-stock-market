import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LANGS, type Lang } from "../../shared/lang";
import { useI18n } from "../i18n";
import type { Toast } from "../useRoom";
import { LogoMark } from "./Logo";
import { PieceRow } from "./PieceToken";

const LANG_LABEL: Record<Lang, string> = { en: "EN", hu: "HU", ko: "한" };

export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t, locked } = useI18n();
  if (locked) return null; // the host's game language applies until the game ends
  return (
    <div className="seg" role="group" aria-label={t("common.language")}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
          {compact ? LANG_LABEL[l] : LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export function Nav({
  logo = [],
  right,
  wide = false,
}: {
  logo?: readonly number[];
  right?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <header className="nav">
      <div className={`container nav-inner${wide ? " room-width" : ""}`}>
        <Link to="/" className="brand">
          <LogoMark shape={logo} />
          <span className="brand-text">{t("app.name")}</span>
        </Link>
        <div className="row">
          {right}
          <LangSwitch />
        </div>
      </div>
    </header>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  const { code } = useI18n();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast${x.kind === "error" ? " error" : ""}`}>
          {code(x.kind === "error" ? "err" : "toast", x.code, x.params)}
        </div>
      ))}
    </div>
  );
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** How long a price takes to count to its new value after a settlement. */
export const COUNT_MS = 2000;

/**
 * Animated number: counts from the value on screen to the new one over `ms`
 * (prices after a settlement, cash, net worth). Respects prefers-reduced-motion.
 */
export function useTween(value: number | null, ms = COUNT_MS): number | null {
  const [shown, setShown] = useState(value);
  const cur = useRef(value); // what is on screen right now
  useEffect(() => {
    if (value === null || cur.current === null || reduceMotion()) {
      cur.current = value;
      setShown(value);
      return;
    }
    const a = cur.current;
    const b = value;
    if (a === b) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      // Ease in-out: a steady count you can follow, settling gently on the new value.
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const v = Math.round(a + (b - a) * e);
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // If a new value arrives mid-count, the next run starts from what is on screen (no jump).
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** Price + arrow + delta. Color is always paired with an arrow. */
export function PriceTag({
  price,
  delta,
  compact = false,
}: {
  price: number | null;
  delta: number | null;
  compact?: boolean;
}) {
  const { money, t } = useI18n();
  const shown = useTween(price);
  if (price === null) {
    return (
      <div>
        <div className="price unknown" title={t("stock.hiddenHint")}>
          ???
        </div>
        <div className="delta unknown">???</div>
      </div>
    );
  }
  return (
    <div>
      <div className="price">{money(shown ?? price, { compact })}</div>
      <Delta value={delta} />
    </div>
  );
}

/** Arrow + amount, in the up/down colors. Used for stock prices and for your cash and net worth. */
export function Delta({ value, align }: { value: number | null; align?: "left" | "right" }) {
  const { money, t } = useI18n();
  const dir = value === null || value === 0 ? 0 : value > 0 ? 1 : -1;
  const arrow = dir > 0 ? "▲" : dir < 0 ? "▼" : "–";
  return (
    <div
      className={`delta ${dir > 0 ? "up" : dir < 0 ? "down" : "muted"}`}
      style={align ? { textAlign: align } : undefined}
    >
      <span aria-hidden="true">{arrow}</span>{" "}
      <span className="sr-only">{dir > 0 ? t("stock.up") : dir < 0 ? t("stock.down") : t("stock.flat")}</span>
      {value === null ? "" : money(Math.abs(value))}
    </div>
  );
}

/** A player's pieces as gold tokens (see PieceToken). */
export function Pips({ n, of, size = 16 }: { n: number; of: number; size?: number | string }) {
  return <PieceRow n={n} of={of} size={size} />;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider sheet (e.g. the rules explainer). */
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={wide ? { maxWidth: 900 } : undefined}
      >
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
