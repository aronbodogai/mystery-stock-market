import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: { sourcemap: true },
  // App version for the footer and /api/health (NFR-VER: bump it in package.json per release).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
