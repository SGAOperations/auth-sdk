import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { version } from "./index.js";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

describe("version", () => {
  it("matches the package.json version", () => {
    expect(version).toBe(pkg.version);
  });
});
