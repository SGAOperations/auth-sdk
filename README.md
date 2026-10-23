# @nusgaops/sgauth

Client SDK for SGAuth, the SGA Operations single sign-on service.

## Install

```bash
npm install @nusgaops/sgauth
```

The package is on the public npm registry, so no `.npmrc` or token is needed.

## Requirements

- Node.js 20 or later
- ESM (`import`) or CommonJS (`require`); both ship with types

## Status

Pre-1.0. The package currently exports only `version`; the session API lands in #3 and #4.

## Releasing

1. Bump `version` in `package.json` and add a matching `## [X.Y.Z]` section to `CHANGELOG.md`.
2. Merge to `main`.
3. Tag the merged commit and push the tag:

   ```bash
   git tag vX.Y.Z <main sha>
   git push origin vX.Y.Z
   ```

4. A prerelease version (`X.Y.Z-beta.N`) publishes to the `next` dist-tag instead of `latest`.

`.github/workflows/release.yml` publishes through npm trusted publishing (GitHub OIDC), so there is no npm token anywhere. The release fails before publishing if:

- the tag does not point at a commit on `main`
- any check fails
- the tag is not `v` followed by the `package.json` version
- `CHANGELOG.md` has no section for the version
- the version is already published, or the registry cannot be read
