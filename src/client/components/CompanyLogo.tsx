import type { CSSProperties, ReactNode } from "react";
import { STOCK_IDS, type StockId } from "../../engine/constants";

/**
 * Each company's brand colours: `co` for the mark and its tinted tile, `co2` for one
 * accent detail. Hues avoid the up/down colours (red, blue, green) and the indigo
 * reserved for interactive elements, so a logo is never mistaken for a price move.
 */
export const COMPANY_COLORS: Record<StockId, { co: string; co2: string }> = {
  open: { co: "#0D9488", co2: "#F59E0B" }, // teal lock, gold keyhole
  coyo: { co: "#EA580C", co2: "#06B6D4" }, // orange coyote, cyan circuit eyes
  latter: { co: "#B45309", co2: "#EAB308" }, // bronze ladder, yellow spark
  defense: { co: "#64748B", co2: "#38BDF8" }, // steel shield, glinting I-beam
  airtight: { co: "#0891B2", co2: "#67E8F9" }, // cyan house, sealed porthole
  seasoned: { co: "#65A30D", co2: "#CA8A04" }, // green leaf, gold coin
  alt: { co: "#C026D3", co2: "#F472B6" }, // fuchsia showbiz
};

/**
 * Company marks, one per stock, drawn as 24×24 line glyphs. The main lines use
 * currentColor (the company colour); `acc` / `acc-fill` details use the accent.
 * Each plays on the company's name. They are identity marks only: they never
 * hint at a stock's rule (the game logo in the header does that job).
 */
const MARKS: Record<StockId, ReactNode> = {
  // Open Security: an open padlock — the shackle has swung free.
  open: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.2" />
      <path d="M8 11V7.5a4 4 0 0 1 7.6-1.8" />
      <circle className="acc-fill" cx="12" cy="15.4" r="1.3" stroke="none" />
      <path className="acc" d="M12 16.3v2" />
    </>
  ),
  // CoyoTech: a geometric coyote head with circuit-node eyes.
  coyo: (
    <>
      <path d="M5 3.5 9.6 8.6h4.8L19 3.5l-.6 8.6L12 20.5l-6.4-8.4Z" />
      <circle className="acc-fill" cx="9.4" cy="12" r="1.2" stroke="none" />
      <circle className="acc-fill" cx="14.6" cy="12" r="1.2" stroke="none" />
      <path d="M12 15.6v2.4M10.6 16.6h2.8" />
    </>
  ),
  // Latter Electronics: a ladder ("latter") with a spark at the top.
  latter: (
    <>
      <path d="M6 3v18M13 3v18M6 7h7M6 11.5h7M6 16h7" />
      <path className="acc" d="M19.5 3 16.8 8.2h3.4L17.4 13.5" />
    </>
  ),
  // Defense Steel: a shield carrying a steel I-beam.
  defense: (
    <>
      <path d="M12 3 19 5.8v5.8c0 4.3-2.9 7.8-7 9.4-4.1-1.6-7-5.1-7-9.4V5.8Z" />
      <path className="acc" d="M9 8.6h6M9 15.4h6M12 8.6v6.8" />
    </>
  ),
  // Airtight Construction: a house with a sealed porthole window.
  airtight: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.2V20h12V9.2" />
      <circle className="acc" cx="12" cy="14" r="2.9" />
      <circle className="acc-fill" cx="12" cy="14" r="1.2" stroke="none" />
    </>
  ),
  // Seasoned Financial: a coin with a falling leaf — money through the seasons.
  seasoned: (
    <>
      <circle className="acc" cx="9.5" cy="14.5" r="6" />
      <circle className="acc" cx="9.5" cy="14.5" r="3.2" />
      <path d="M14.2 9.2c-.3-3.6 2.2-6 6.3-6.2.2 4.1-2.2 6.6-6.3 6.2Z" />
      <path d="M14.2 9.2 18.3 5" />
    </>
  ),
  // Alt Entertainment: the "M" zigzag — the same shape as the game logo and the show-rules price path.
  alt: (
    <>
      <path d="M3 18 7.5 6l4.5 8 4.5-8L21 18" />
      <circle className="acc-fill" cx="12" cy="14" r="1.4" stroke="none" />
    </>
  ),
};

/** CSS variables carrying a company's colours (used by the logo tile). */
export function companyStyle(i: number): CSSProperties {
  const id = STOCK_IDS[i];
  const c = id ? COMPANY_COLORS[id] : { co: "currentColor", co2: "currentColor" };
  return { "--co": c.co, "--co2": c.co2 } as CSSProperties;
}

/** Bare glyph, for inline use. */
export function CompanyGlyph({ i, size = 24, strokeWidth = 1.7 }: { i: number; size?: number | string; strokeWidth?: number }) {
  const id = STOCK_IDS[i];
  if (!id) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {MARKS[id]}
    </svg>
  );
}

/** Glyph on a rounded tile: the company's logo as shown on cards, the TV and results. */
export function CompanyLogo({ i, size = 36 }: { i: number; size?: number | string }) {
  const s = typeof size === "number" ? `${size}px` : size;
  return (
    <span className="co-logo" style={{ width: s, height: s, ...companyStyle(i) }} aria-hidden="true">
      <CompanyGlyph i={i} size="62%" />
    </span>
  );
}
