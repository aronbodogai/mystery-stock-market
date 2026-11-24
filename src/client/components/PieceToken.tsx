// A star chip around (12, 12): eight edge spots, an inner disc and a five-point star.
const SPOT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const STAR =
  "12 7 13.23 10.3 16.76 10.45 14 12.65 14.94 16.05 12 14.1 9.06 16.05 10 12.65 7.24 10.45 10.77 10.3";

/**
 * A piece: a gold casino chip with a star in the middle. A spent (or missing)
 * piece is a dashed outline of the chip, so the count reads at a glance and
 * never looks like a price colour.
 */
export function PieceToken({ filled = true, size = 16 }: { filled?: boolean; size?: number | string }) {
  return (
    <svg
      className={`piece-token${filled ? "" : " is-empty"}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {filled ? (
        <>
          <circle cx="12" cy="12" r="10.6" fill="var(--piece-body)" stroke="var(--piece-edge)" strokeWidth="0.6" />
          {SPOT_ANGLES.map((a) => (
            <rect
              key={a}
              x="10.8"
              y="1.6"
              width="2.4"
              height="3.3"
              rx="0.5"
              fill="var(--piece-hi)"
              transform={`rotate(${a} 12 12)`}
            />
          ))}
          <circle cx="12" cy="12" r="6.6" fill="var(--piece)" stroke="var(--piece-edge)" strokeWidth="0.7" />
          <polygon points={STAR} fill="var(--piece-ink)" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" fill="none" stroke="var(--neutral)" strokeWidth="1.4" strokeDasharray="2.4 2" />
          <circle cx="12" cy="12" r="5.8" fill="none" stroke="var(--neutral)" strokeWidth="1" strokeDasharray="1.6 2" />
        </>
      )}
    </svg>
  );
}

/** A row of pieces: `n` gold chips out of `of`. */
export function PieceRow({ n, of, size = 16 }: { n: number; of: number; size?: number | string }) {
  return (
    <span className="piece-row" role="img" aria-label={`${n}/${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <PieceToken key={i} filled={i < n} size={size} />
      ))}
    </span>
  );
}
