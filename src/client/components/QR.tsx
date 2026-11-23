import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** QR code drawn client-side as SVG rects (no innerHTML). Always dark-on-white for scanners. */
export function QR({ value, size = 200, label }: { value: string; size?: number; label?: string }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    }
    return { count: n, path: d };
  }, [value]);
  return (
    <span className="qr" role="img" aria-label={label ?? value}>
      <svg viewBox={`0 0 ${count} ${count}`} width={size} height={size} shapeRendering="crispEdges">
        <path d={path} fill="#0A0A0A" />
      </svg>
    </span>
  );
}
