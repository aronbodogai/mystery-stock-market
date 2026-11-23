/** Price chart. Null points (hidden rounds) are never drawn: the line breaks around them. */
export function Sparkline({
  points,
  width = 120,
  height = 36,
  totalRounds = 24,
  strokeWidth = 1.8,
}: {
  points: readonly (number | null)[];
  width?: number;
  height?: number;
  totalRounds?: number;
  strokeWidth?: number;
}) {
  const vals = points.filter((p): p is number => p !== null);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const span = max - min || 1;
  const n = Math.max(totalRounds, points.length - 1, 1);
  const x = (i: number) => (i / n) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);

  const segments: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p === null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(" "));
  const last = points.length ? points[points.length - 1] : null;
  const first = vals[0];
  const tone = last == null || first === undefined ? "muted" : last > first ? "up" : last < first ? "down" : "muted";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={tone}
      aria-hidden="true"
      style={{ display: "block", maxWidth: width * 2 }}
    >
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="var(--border)" strokeWidth="1" />
      {segments.map((s, i) =>
        s.includes(" ") ? (
          <polyline key={i} points={s} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : (
          <circle key={i} cx={s.split(",")[0]} cy={s.split(",")[1]} r={strokeWidth} fill="currentColor" />
        ),
      )}
    </svg>
  );
}
