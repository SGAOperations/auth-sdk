import { readFileSync, rmSync } from "node:fs";
import { defineConfig, type Options } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

// tsup builds the configs below in parallel, so its own `clean` option would
// race the second one. Clear the output once, before either starts.
rmSync("dist", { recursive: true, force: true });

const shared: Options = {
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  outDir: "dist",
  define: {
    __SGAUTH_SDK_VERSION__: JSON.stringify(pkg.version),
  },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts", next: "src/next.ts" },
    target: "node20",
  },
  {
    // A browser platform makes esbuild fail the build if a `node:` import
    // leaks into these entries' graphs. `proxy` runs on the edge runtime.
    ...shared,
    entry: {
      browser: "src/browser/index.ts",
      urls: "src/urls.ts",
      proxy: "src/proxy.ts",
    },
    platform: "browser",
    target: "es2022",
  },
]);
