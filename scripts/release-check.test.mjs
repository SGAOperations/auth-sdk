import { describe, expect, it } from "vitest";
import { evaluateRelease } from "./release-check.mjs";

const CHANGELOG =
  "# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-10-23\n\n- Initial release.\n";

/** @param {Partial<Parameters<typeof evaluateRelease>[0]>} overrides */
function input(overrides = {}) {
  return {
    tag: "v0.1.0",
    name: "@sgaoperations/sgauth",
    version: "0.1.0",
    changelog: CHANGELOG,
    publishedVersions: [],
    ...overrides,
  };
}

describe("evaluateRelease", () => {
  it("passes a matching, unpublished, changelogged release as latest", () => {
    expect(evaluateRelease(input())).toEqual({ errors: [], distTag: "latest" });
  });

  it("fails when the tag does not match package.json", () => {
    const { errors } = evaluateRelease(input({ tag: "v0.1.1" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/does not match package\.json/);
  });

  it("fails on a version that is not strict semver", () => {
    const { errors } = evaluateRelease(
      input({
        tag: "v0.1.0+build.1",
        version: "0.1.0+build.1",
        changelog: "## [0.1.0+build.1]\n",
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not strict semver/);
  });

  it("fails on the wrong package name", () => {
    const { errors } = evaluateRelease(input({ name: "@sgaoperations/other" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/expected @sgaoperations\/sgauth/);
  });

  it("fails when CHANGELOG.md has no section for the version", () => {
    const { errors } = evaluateRelease(
      input({ changelog: "# Changelog\n\n## [Unreleased]\n" }),
    );
    expect(errors).toEqual(['CHANGELOG.md has no "## [0.1.0]" section.']);
  });

  it("fails with the collision message when the version is already published", () => {
    const { errors } = evaluateRelease(
      input({ publishedVersions: ["0.0.0", "0.1.0"] }),
    );
    expect(errors).toEqual([
      "Version 0.1.0 is already published to npm. Bump package.json and CHANGELOG.md, then tag again.",
    ]);
  });

  it("uses dist-tag next for a prerelease", () => {
    const result = evaluateRelease(
      input({
        tag: "v1.0.0-beta.1",
        version: "1.0.0-beta.1",
        changelog: "## [1.0.0-beta.1]\n",
      }),
    );
    expect(result).toEqual({ errors: [], distTag: "next" });
  });
});
