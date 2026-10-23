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

Pre-1.0. The package exports `version` and the server-side session API below. Framework helpers land in #4.

## Sessions

`getSession()` resolves the SGAuth session for an incoming request. **Server-side only: never call it from browser code.**

```ts
import { getSession } from "@nusgaops/sgauth";
import { headers } from "next/headers";

// Next route handler or server component
const session = await getSession({ headers: await headers() });

// Node
const session = await getSession({ cookieHeader: req.headers.cookie });

if (session === null) {
  // unauthenticated, or SGAuth is unreachable with nothing usable cached
}
```

It returns `SgaSession | null`: `{ user, positions, session }`. Dates are ISO strings.

For a custom setup, build your own client (each owns its cache):

```ts
import { createSgauthClient } from "@nusgaops/sgauth";

const sgauth = createSgauthClient({
  baseUrl: "https://auth.example.com",
  onError: ({ kind, status, servedStale }) =>
    log.warn({ kind, status, servedStale }),
});
const session = await sgauth.getSession({ headers });
```

### Configuration

| Option                | Env                  | Default                         | Range       |
| --------------------- | -------------------- | ------------------------------- | ----------- |
| `baseUrl`             | `SGAUTH_URL`         | required                        | http(s) URL |
| `cookieName`          | `SGAUTH_COOKIE_NAME` | `__Secure-sgauth.session_token` |             |
| `cacheTtlSeconds`     |                      | 60                              | 1 to 300    |
| `staleIfErrorSeconds` |                      | 300                             | 0 to 900    |
| `timeoutMs`           |                      | 3000                            | 1 to 10000  |
| `maxEntries`          |                      | 5000                            | at least 1  |
| `fetch`               |                      | `globalThis.fetch`              |             |
| `onError`             |                      | none                            |             |

Misconfiguration throws `SgauthConfigError`. Dev and local SGAuth use different cookie names (`__Secure-sgauth-dev.session_token`, `sgauth-local.session_token`).

### Caching and failure behaviour

- Only the SGAuth session cookie and its `dont_remember` sibling are forwarded; the product's other cookies never leave the process.
- Sessions are cached in memory, keyed by the SHA-256 of the token, for `cacheTtlSeconds`. A 401 is cached as `null` for 10 seconds. Concurrent lookups for one token share a single request.
- Revocation is therefore observed within `cacheTtlSeconds` per process.
- **Fail closed.** On a timeout, network error, 5xx, 429, redirect, or malformed response, the SDK serves a previously cached session for that token for up to `staleIfErrorSeconds` past its TTL and calls `onError`. With nothing cached it returns `null`. A 401 is never served stale, and a session is never served past its own expiry.
- `getSession` never throws for an upstream failure. It throws only `SgauthConfigError` and `TypeError` for a bad input shape.

**Never log the `Cookie` header or the raw session cookie.** Redact `cookie` in request loggers. `onError` never receives either.

### Schemas

The JSON Schemas for the session response ship under `@nusgaops/sgauth/schemas/*`.

### Integration test

`npm run test:integration` signs in to an SGAuth deployment and asserts that sign-out is observed within 60 seconds. It skips unless `SGAUTH_URL`, `SGAUTH_COOKIE_NAME`, `SGAUTH_TEST_EMAIL` and `SGAUTH_TEST_PASSWORD` are set. Use a synthetic account without MFA.

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
