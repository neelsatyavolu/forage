import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The import's tests, with the app's aliases (see vitest.config.mts at the
// root, which only picks up lib/, components/ and app/). Run with:
//   pnpm vitest run --config scripts/osm-import/vitest.config.mts
const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root(""), "server-only": root("test/server-only-stub.ts") } },
  test: { root: root(""), include: ["scripts/osm-import/**/*.test.ts"], testTimeout: 30_000 },
});
