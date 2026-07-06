import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts: tests don't need the React,
// Tailwind, or PWA plugins, and vite.config.ts fails the build when
// VITE_CONVEX_URL is unset — tests must run without env setup.
export default defineConfig({
  test: {
    // convex-test runs Convex functions in-process; the edge-runtime
    // environment matches the Convex runtime more closely than node.
    // Per-file overrides via `// @vitest-environment` docblocks:
    // convex/*.test.ts files opt into edge-runtime, src tests stay node.
    environment: "node",
    server: { deps: { inline: ["convex-test"] } },
  },
});
