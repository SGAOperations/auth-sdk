import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __SGAUTH_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    environment: "node",
  },
});
