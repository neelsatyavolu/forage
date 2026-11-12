import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "app/**/*.test.ts"],
    // Each database test file starts its own in-memory Postgres (PGlite), which is slow on a busy machine.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      // Thin wrappers over cookies, network and the shared auth package; covered by the live checks.
      exclude: ["lib/**/*.test.ts", "lib/ai/session.ts", "lib/ai/providers.ts", "lib/ai/models.ts", "lib/ai/index.ts", "lib/api.ts", "lib/server/**"],
    },
  },
});
