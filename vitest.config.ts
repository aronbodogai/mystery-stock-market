import { defineConfig } from "vitest/config";

// Engine + projection tests: pure TypeScript, run in Node.
export default defineConfig({
  test: {
    name: "engine",
    include: ["test/engine/**/*.test.ts"],
    environment: "node",
  },
});
