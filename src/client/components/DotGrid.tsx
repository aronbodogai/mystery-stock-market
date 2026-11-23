import { useEffect, useRef } from "react";

/** The interactive dot grid: the only decorative element (design.md). Dots swell near the pointer. */
export function DotGrid() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0,
      h = 0,
      raf = 0;
    const pointer = { x: -9999, y: -9999 };
    const gap = 22;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#0a0a0a";
      ctx.fillStyle = color;
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          const k = Math.max(0, 1 - d / 140);
          ctx.globalAlpha = 0.09 + k * 0.45;
          ctx.beginPath();
          ctx.arc(x, y, 1 + k * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      if (reduce) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    const onLeave = () => {
      pointer.x = pointer.y = -9999;
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return <canvas ref={ref} className="dotgrid" style={{ width: "100%", height: "100%" }} aria-hidden="true" />;
}
