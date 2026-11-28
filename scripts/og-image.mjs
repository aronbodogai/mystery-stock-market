// Renders public/og-image.png (1200×630), the link-preview image (NFR-SEO-3).
// Run after changing the logo or the wording: `node scripts/og-image.mjs`.
// Uses the locally installed Chrome through Playwright (set PW_CHANNEL to override).
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../public/og-image.png", import.meta.url));

// The show's M logo (SHOW_LOGO in src/engine/rules.ts), drawn the way LogoMark draws it.
const SHOW_LOGO = [
  10000, 11800, 13600, 15400, 17200, 19000, 20800, 19300, 17800, 16300, 14800, 13300, 11800,
  13300, 14800, 16300, 17800, 19300, 20800, 18800, 16800, 14800, 12800, 10800, 8800,
];
const min = Math.min(...SHOW_LOGO);
const span = Math.max(...SHOW_LOGO) - min;
const pts = SHOW_LOGO.map((v, i) => `${(6 + (i / (SHOW_LOGO.length - 1)) * 20).toFixed(2)},${(7 + (1 - (v - min) / span) * 18).toFixed(2)}`).join(" ");

const html = `<!doctype html><html><head>
<link href="https://api.fontshare.com/v2/css?f[]=general-sans@600&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400&display=swap" rel="stylesheet" />
<style>
  html, body { margin: 0; width: 1200px; height: 630px; background: #FAFAFA; }
  body { display: flex; flex-direction: column; justify-content: center; padding: 0 96px; box-sizing: border-box; font-family: "DM Sans", sans-serif; color: #0A0A0A; }
  .mark { width: 120px; height: 120px; border-radius: 30px; background: #0A0A0A; color: #FAFAFA; display: grid; place-items: center; margin-bottom: 48px; }
  h1 { font-family: "General Sans", sans-serif; font-weight: 600; font-size: 88px; letter-spacing: -0.04em; line-height: 1; margin: 0 0 28px; }
  p { font-size: 34px; line-height: 1.35; color: #6B6B6B; margin: 0; max-width: 940px; }
  .url { position: absolute; left: 96px; bottom: 56px; font-size: 26px; color: #6B6B6B; }
</style></head><body>
  <div class="mark"><svg viewBox="0 0 32 32" width="120" height="120"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <h1>Mystery Stock Market</h1>
  <p>Trade seven mystery stocks with friends. Every price follows a hidden rule — work it out before everyone else.</p>
  <div class="url">stocks.aroncreates.com</div>
</body></html>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(`wrote ${out}`);
