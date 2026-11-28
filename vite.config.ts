import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineConfig(({ command }) => ({
  plugins: [react(), cloudflare()],
  build: { sourcemap: true },
  define: {
    // App version for the footer and /api/health (NFR-VER: bump it in package.json per release).
    __APP_VERSION__: JSON.stringify(pkg.version),
    // The Worker skips its Content-Security-Policy under the dev server (src/worker/pages.ts).
    __DEV_SERVER__: JSON.stringify(command === "serve"),
  },
}));
