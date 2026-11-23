import { SHOW_LOGO, logoShape } from "../../engine/rules";

const DEFAULT = logoShape(SHOW_LOGO);

/**
 * The game logo. It is drawn from the logo path itself, so the `logo` rule
 * "hides in plain sight": the logo is the chart of one stock.
 */
export function LogoMark({ shape, size = 32 }: { shape: readonly number[]; size?: number }) {
  const pts = shape.length > 1 ? shape : DEFAULT;
  const pad = 6;
  const w = 32 - pad * 2;
  const h = 32 - pad * 2 - 2;
  const d = pts
    .map((v, i) => `${(pad + (i / (pts.length - 1)) * w).toFixed(2)},${(pad + 1 + (1 - v) * h).toFixed(2)}`)
    .join(" ");
  return (
    <span className="logo-mark" style={{ width: size, height: size, borderRadius: size / 4 }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <polyline points={d} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
