import { defineConfig } from "vitest/config";

// `.mts`, not `.ts` — the extension is what stops Vite's config loader warning
// about ESM-in-CJS. Only `lib/**` is globbed: the engine is the thing under test,
// and a test placed outside `lib/` will silently never run.
export default defineConfig({
  resolve: {
    // Matches the `@/*` path in tsconfig, so tests outside the engine can reach
    // `@/data` the same way route handlers do.
    alias: { "@": import.meta.dirname },
  },
  test: {
    include: ["lib/**/*.test.ts"],
  },
});
