// Release gate for `.github/workflows/release.yml`. Fails the job before
// `npm publish` when the pushed tag, package.json, CHANGELOG.md and the npm
// registry disagree, and emits the dist-tag the publish step should use.
//
// Every failure is closed: if the registry cannot be read, nothing publishes.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "@nusgaops/sgauth";
const REGISTRY_URL = "https://registry.npmjs.org/@nusgaops%2fsgauth";
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

/**
 * @param {{ tag: string, name: string, version: string, changelog: string, publishedVersions: string[] }} input
 * @returns {{ errors: string[], distTag: "latest" | "next" }}
 */
export function evaluateRelease({
  tag,
  name,
  version,
  changelog,
  publishedVersions,
}) {
  /** @type {string[]} */
  const errors = [];
  if (tag !== `v${version}`) {
    errors.push(
      `Tag ${tag} does not match package.json version ${version} (expected v${version}).`,
    );
  }
  if (!SEMVER.test(version)) {
    errors.push(
      `Version ${version} is not strict semver (MAJOR.MINOR.PATCH with an optional -prerelease).`,
    );
  }
  if (name !== PACKAGE_NAME) {
    errors.push(`Package name is ${name}, expected ${PACKAGE_NAME}.`);
  }
  if (
    !changelog.split(/\r?\n/).some((line) => line.startsWith(`## [${version}]`))
  ) {
    errors.push(`CHANGELOG.md has no "## [${version}]" section.`);
  }
  if (publishedVersions.includes(version)) {
    errors.push(
      `Version ${version} is already published to npm. Bump package.json and CHANGELOG.md, then tag again.`,
    );
  }
  return { errors, distTag: version.includes("-") ? "next" : "latest" };
}

/** @returns {Promise<string[]>} */
async function fetchPublishedVersions() {
  const res = await fetch(REGISTRY_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return [];
  if (res.status !== 200) {
    throw new Error(
      `npm registry returned HTTP ${res.status} for ${PACKAGE_NAME}.`,
    );
  }
  const body = /** @type {{ versions?: Record<string, unknown> }} */ (
    await res.json()
  );
  return Object.keys(body.versions ?? {});
}

async function main() {
  const tag = process.env.GITHUB_REF_NAME ?? "";
  const pkg = /** @type {{ name: string, version: string }} */ (
    JSON.parse(readFileSync("package.json", "utf8"))
  );
  const changelog = readFileSync("CHANGELOG.md", "utf8");

  /** @type {string[]} */
  let publishedVersions;
  try {
    publishedVersions = await fetchPublishedVersions();
  } catch (err) {
    console.log(
      `::error::Could not read published versions from npm: ${String(err)}`,
    );
    process.exit(1);
  }

  const { errors, distTag } = evaluateRelease({
    tag,
    name: pkg.name,
    version: pkg.version,
    changelog,
    publishedVersions,
  });
  if (errors.length > 0) {
    for (const msg of errors) console.log(`::error::${msg}`);
    process.exit(1);
  }

  console.log(
    `Release check passed: ${pkg.name}@${pkg.version} -> dist-tag ${distTag}`,
  );
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `dist-tag=${distTag}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
