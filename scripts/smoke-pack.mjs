// Packs the built package, installs the tarball into a throwaway project, and
// checks that both `import` and `require` resolve it to the package.json
// version. Run after `npm run build`.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const pkg = /** @type {{ name: string, version: string }} */ (
  JSON.parse(readFileSync("package.json", "utf8"))
);

// npm is a .cmd shim on Windows, which Node only spawns through a shell, so
// run npm's own CLI script with this Node binary instead.
const [npmBin, ...npmPrefix] =
  process.platform === "win32"
    ? [
        process.execPath,
        join(
          dirname(process.execPath),
          "node_modules",
          "npm",
          "bin",
          "npm-cli.js",
        ),
      ]
    : ["npm"];

/**
 * @param {string[]} args
 * @param {string} [cwd]
 */
function npm(args, cwd) {
  return execFileSync(npmBin, [...npmPrefix, ...args], {
    cwd,
    encoding: "utf8",
  });
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function node(args, cwd) {
  return execFileSync(process.execPath, args, { cwd, encoding: "utf8" }).trim();
}

const packDir = mkdtempSync(join(tmpdir(), "sgauth-pack-"));
const consumerDir = mkdtempSync(join(tmpdir(), "sgauth-consumer-"));
let failed = false;

try {
  const packed = /** @type {{ filename: string }[]} */ (
    JSON.parse(npm(["pack", "--json", "--pack-destination", packDir]))
  );
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("npm pack produced no tarball.");
  const tarball = join(packDir, filename);

  npm(["init", "-y"], consumerDir);
  npm(["install", "--no-audit", "--no-fund", tarball], consumerDir);

  const esm = node(
    [
      "--input-type=module",
      "-e",
      `import { version } from "${pkg.name}"; console.log(version);`,
    ],
    consumerDir,
  );
  const cjs = node(
    ["-e", `console.log(require("${pkg.name}").version);`],
    consumerDir,
  );

  for (const [label, got] of [
    ["ESM import", esm],
    ["CJS require", cjs],
  ]) {
    if (got === pkg.version) {
      console.log(`${label}: ${got}`);
    } else {
      console.error(
        `${label}: expected ${pkg.version}, got ${JSON.stringify(got)}`,
      );
      failed = true;
    }
  }
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(consumerDir, { recursive: true, force: true });
}

if (failed) process.exit(1);
