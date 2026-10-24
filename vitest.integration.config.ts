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
    include: ["test/integration/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
