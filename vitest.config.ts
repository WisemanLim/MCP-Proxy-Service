import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@mcp-proxy/manifest": resolve(__dirname, "packages/manifest/src/index.ts"),
      "@mcp-proxy/converter": resolve(__dirname, "packages/converter/src/index.ts"),
      "@mcp-proxy/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@mcp-proxy/core": resolve(__dirname, "apps/api/src/core/index.ts"),
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  ssr: {
    // node:sqlite is a Node 22+ builtin not yet in Vite's builtin list
    external: ["node:sqlite"],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: true,
    server: {
      deps: { external: [/node:sqlite/] },
    },
  },
});
