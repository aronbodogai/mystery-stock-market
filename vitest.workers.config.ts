import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Durable Object tests: run inside workerd via the Workers Vitest integration.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
  test: {
    name: "worker",
    include: ["test/worker/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
