import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __SGAUTH_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // The package's default export throws outside a server-component build.
      "server-only": fileURLToPath(
        new URL("node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    environment: "node",
  },
});
