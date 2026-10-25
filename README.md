# @nusgaops/sgauth

[![npm version](https://img.shields.io/npm/v/@nusgaops/sgauth)](https://www.npmjs.com/package/@nusgaops/sgauth)

Server-side SGAuth session helpers for Next.js products on `*.northeasternsga.com`. SGAuth is the SGA Operations single sign-on service: it sets one session cookie for the whole parent domain, and this package turns that cookie into a validated session (`user`, `positions`) in your server code, with caching and fail-closed behaviour when SGAuth is unreachable.

**Requirements**

- Node.js 20 or later.
- Next.js 15 or later with React 19 or later for the Next.js helpers. `next` and `react` are optional peer dependencies, so a plain Node product installs cleanly.
- Everything is server-only except the URL builders (`loginUrl`, `logoutUrl`, `accountUrl`) and the `@nusgaops/sgauth/browser` entry.
- ESM (`import`) or CommonJS (`require`); both ship with types.

## Install

```bash
npm install @nusgaops/sgauth
```

The package is on the public npm registry, so no `.npmrc`, token or registry configuration is needed. Each release is published with provenance, which the npm page shows.

## Environment variables

| Variable                 | Required                              | Default                         | What it does                                                                                                                              |
| ------------------------ | ------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SGAUTH_URL`             | yes                                   | none                            | Base URL of SGAuth, read by server code. Production is `https://auth.northeasternsga.com`. Missing or invalid throws `SgauthConfigError`. |
| `SGAUTH_COOKIE_NAME`     | only when it differs from the default | `__Secure-sgauth.session_token` | Name of the SGAuth session cookie. Each SGAuth environment uses its own name, so a mismatch makes every request look signed out.          |
| `NEXT_PUBLIC_SGAUTH_URL` | no                                    | falls back to `SGAUTH_URL`      | The same origin, for the URL builders in client bundles. Server code can leave it unset.                                                  |

Values per environment:

| Environment      | `SGAUTH_URL`                           | `SGAUTH_COOKIE_NAME`                |
| ---------------- | -------------------------------------- | ----------------------------------- |
| Production       | `https://auth.northeasternsga.com`     | `__Secure-sgauth.session_token`     |
| Dev and previews | `https://auth-dev.northeasternsga.com` | `__Secure-sgauth-dev.session_token` |
| Local            | `http://auth.sga.localhost:3000`       | `sgauth-local.session_token`        |

[`docs/ENVIRONMENTS.md`](https://github.com/SGAOperations/auth/blob/main/docs/ENVIRONMENTS.md) in the SGAuth repository is the source of truth for these values.

## Quick start

The shortest working integration, mirroring [`examples/next-app`](examples/next-app/README.md).

**1. Redirect signed-out visitors.** `proxy.ts` (Next 16; in Next 15 name the file `middleware.ts` and export `middleware` instead) sends a request without the SGAuth cookie to sign-in. Paths in `publicPaths` need no session.

```ts
// proxy.ts
import { createSgaProxy } from "@nusgaops/sgauth/proxy";

export const proxy = createSgaProxy({
  publicPaths: ["/", "/docs", /^\/api\/health$/],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

A string in `publicPaths` matches that path and everything beneath it (`/docs` matches `/docs/a`, not `/docsx`); `"/"` matches only the home page. A request without the cookie is redirected to sign-in (`GET` and `HEAD`) or answered `401 { "error": "unauthenticated" }` (other methods).

**2. Validate in server code.** `requireSession()` checks the session with SGAuth and redirects to sign-in when it is invalid or revoked.

```tsx
// app/protected/page.tsx
import { requireSession } from "@nusgaops/sgauth/next";

export default async function Page() {
  const session = await requireSession();
  return <p>Signed in as {session.user.email}</p>;
}
```

**3. Gate an action on a position, and add logout.** A Server Action must check on the server, because hiding a button is not enough. `logoutUrl()` builds the sign-out link; render it as a plain `<a>`, never a prefetching `<Link>`, which would sign the user out on hover.

```ts
// app/finance/actions.ts
"use server";
import { hasPosition, requireSession } from "@nusgaops/sgauth/next";

export async function approvePurchase() {
  const session = await requireSession();
  if (!hasPosition(session, "vp-finance")) return;
  // ...
}
```

```tsx
import { logoutUrl } from "@nusgaops/sgauth/next";

<a href={logoutUrl("https://myproduct.northeasternsga.com/")}>Log out</a>;
```

`getServerSession()` returns `SgaSession | null` without redirecting. `hasAnyPosition(session, keys)` and `hasAllPositions(session, keys)` take a list of keys (both `false` for an empty list, so nothing is granted vacuously), and `isAdmin(session)` is true for an admin or the primary admin. Guards take `SgaSession | null | undefined` and treat no session as no access.

## How validation works

The proxy only checks that the cookie is present. It makes no network call. That is a UX redirect, not a security boundary: real validation is `requireSession()` or `getSession()` in server code, which rejects an invalid or revoked cookie.

The proxy never calls SGAuth because middleware runs on every request and on every instance. A round trip there would add latency to every page and bypass the per-instance session cache that `getSession()` relies on.

`requireSession()` works in server components, Server Actions and route handlers. It is built on `getServerSession()`, which is wrapped in React's `cache()`, so one request resolves the session once however many components ask. The proxy also sets an `x-sgauth-return-to` request header to the absolute URL being requested (replacing any client-supplied value), so `requireSession()` can send the user back where they were.

Outside Next.js, call `getSession()` directly:

```ts
import { getSession } from "@nusgaops/sgauth";

const session = await getSession({ cookieHeader: req.headers.cookie });
// or, with a Headers-like object: getSession({ headers })
```

It returns `SgaSession | null`: `{ user, positions, session }`. Dates are ISO strings.

## Caching and availability

Sessions are cached in memory per process, keyed by the SHA-256 of the session token (the token itself is never stored). Concurrent lookups for one token share a single request. Only the SGAuth session cookie and its `dont_remember` sibling are forwarded to SGAuth; the product's other cookies never leave the process.

| Option                | Default | Range      | Meaning                                                          |
| --------------------- | ------- | ---------- | ---------------------------------------------------------------- |
| `cacheTtlSeconds`     | 60      | 1 to 300   | How long a session is served without asking SGAuth again.        |
| negative cache        | 10 s    | fixed      | How long a 401 (invalid token) is remembered as `null`.          |
| `timeoutMs`           | 3000    | 1 to 10000 | Request timeout.                                                 |
| `staleIfErrorSeconds` | 300     | 0 to 900   | How long past the TTL a cached session may be served on failure. |
| `maxEntries`          | 5000    | at least 1 | Cache size; the least recently used entry is evicted first.      |

These are options of `createSgauthClient()`, as are `baseUrl`, `cookieName`, `fetch` and `onError`. The default client behind `getSession()` and `requireSession()` uses the defaults above. Misconfiguration throws `SgauthConfigError`. Each client owns its cache, so build it once and reuse it.

**Stale-if-error.** On a network error, timeout, 5xx, 429, redirect or malformed response, the SDK serves the last good session for that token for up to `staleIfErrorSeconds` past its TTL, and calls `onError`. With no cached entry it returns `null`, so it fails closed. A 401 is never served stale, a session is never served past its own expiry, and a failure is never cached as a session. `getSession` throws only `SgauthConfigError`, or `TypeError` for a bad input shape, never for an upstream failure.

**The bound.** A revoked session can stay usable for up to `cacheTtlSeconds` (60 s by default) while SGAuth is reachable, and up to `cacheTtlSeconds + staleIfErrorSeconds` after the last successful lookup while SGAuth is unreachable. With the defaults that is 6 minutes; at the maximum settings it is 20 minutes, of which the stale window is at most 15.

Report failures without leaking credentials. `onError` receives `{ kind, status, servedStale }` and never a cookie or a token:

```ts
import { createSgauthClient } from "@nusgaops/sgauth";

export const sgauth = createSgauthClient({
  onError: ({ kind, status, servedStale }) =>
    console.warn("sgauth upstream failure", { kind, status, servedStale }),
});
const session = await sgauth.getSession({ headers });
```

## Security

- **Never log the forwarded `Cookie` header or the session token.** Redact `cookie` in request loggers.
- Do not call the helpers from client components. Importing `@nusgaops/sgauth/next` from client code fails the build, and the guards throw in the browser.
- The URL builders (`@nusgaops/sgauth/urls`) and the `@nusgaops/sgauth/browser` entry are the only browser-safe exports.

## Dev and preview environments

- Products point their preview and dev deployments at **dev SGAuth** (`https://auth-dev.northeasternsga.com`).
- Each product needs a stable branch domain such as `<product>-dev.northeasternsga.com` for SSO to work, and its origin must be an active row in that environment's product registry.
- Ad-hoc `*.vercel.app` previews cannot use SSO: the browser never sends a `northeasternsga.com` cookie to `vercel.app`, so the session is always `null` there.
- Local development runs the product on `<product>.sga.localhost:<port>` against SGAuth on `auth.sga.localhost:3000`. Never browse to bare `localhost`: the session cookie's domain is `sga.localhost`. Chrome and Edge resolve `*.localhost` natively, Firefox needs the hostnames added to `network.dns.localDomains` in `about:config`, and Safari may need a hosts-file entry such as `127.0.0.1 auth.sga.localhost myproduct.sga.localhost`.
- `__Secure-` cookies need HTTPS, so a dev-SGAuth cookie is never sent to plain `http://localhost`.

See [`docs/ENVIRONMENTS.md`](https://github.com/SGAOperations/auth/blob/main/docs/ENVIRONMENTS.md) in the SGAuth repository for the full topology.

## Access tokens for Supabase clients

SGAuth mints a short-lived JWT (about 10 minutes) that a product's Supabase project accepts. `getAccessToken()` fetches it from `{SGAUTH_URL}/api/auth/token` with the forwarded SGAuth cookie and caches it, keyed by the SHA-256 of the session token, until 60 seconds before its `exp`. It takes the same `{ headers } | { cookieHeader }` input and reads the same `SGAUTH_URL` and `SGAUTH_COOKIE_NAME` as `getSession()`. **Server-side only.**

### On the server

`createSupabaseAccessTokenProvider()` returns the `accessToken` callback shape that supabase-js's `createClient` expects. Build it per request:

```ts
import { createSupabaseAccessTokenProvider } from "@nusgaops/sgauth";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: createSupabaseAccessTokenProvider({ headers: await headers() }),
});
```

The callback resolves to `null` for a signed-out user, and supabase-js then falls back to the anon key. `getAccessToken(input)` returns the same `string | null` directly.

### In the browser

The browser must never see the SGAuth cookie, so it asks a same-origin product route that proxies to SGAuth. Mount the route:

```ts
// app/api/sgauth/token/route.ts
import { createAccessTokenRouteHandler } from "@nusgaops/sgauth";

export const GET = createAccessTokenRouteHandler();
export const dynamic = "force-dynamic";
```

It answers `200 { token }`, `401 { token: null }` when signed out, or `503 { error: "sgauth_unavailable" }`. Every response is `Cache-Control: no-store` and carries no CORS headers, so only same-origin scripts can read the token. Only the SGAuth cookie is forwarded upstream.

Then build the client from the browser entry, which has no Node imports:

```ts
import { createBrowserSupabaseAccessTokenProvider } from "@nusgaops/sgauth/browser";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: createBrowserSupabaseAccessTokenProvider({
    // endpoint: "/api/sgauth/token" (the default)
  }),
});
```

### Options

`getAccessToken`, `createSupabaseAccessTokenProvider` and `createAccessTokenRouteHandler` take an optional options object: `baseUrl`, `cookieName`, `timeoutMs`, `maxEntries`, `fetch` and `onError`, as above, plus `refreshSkewSeconds` (default 60, clamped to 0 to 300). Each options object gets its own cache, so create it once and reuse it rather than passing a fresh literal on every call.

The browser provider takes `endpoint` (default `/api/sgauth/token`), `refreshSkewSeconds`, `timeoutMs` (default 3000), `onError` and `fetch`.

### Behaviour and caveats

- Concurrent callers share one request. A token is replaced once `exp - refreshSkewSeconds` passes.
- **Revocation takes effect at the next refresh.** A revoked session keeps its cached token for up to about 9 minutes, and the JWT itself stays valid until its `exp`. A 401 or 403 drops the cached token, and nothing is cached for a signed-out user.
- **Fail closed.** On a timeout, network error, 429, 5xx or malformed response, the cached token is served only while it has more than 10 seconds left, and `onError` is called. With nothing usable cached the result is `null` (the route answers 503). Failures are never cached.
- `onError` receives `{ kind, status, servedStale }`, never a cookie or a token.

## API reference

Every public export, by entry point:

| Entry                      | Export                                     | Purpose                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nusgaops/sgauth`         | `version`                                  | The installed package version.                                                                                                                                                                                                                                                                             |
|                            | `getSession`                               | Resolve the session for a request, using the default client.                                                                                                                                                                                                                                               |
|                            | `createSgauthClient`                       | Build a session client with its own cache and options.                                                                                                                                                                                                                                                     |
|                            | `SgauthConfigError`                        | Thrown for misconfiguration.                                                                                                                                                                                                                                                                               |
|                            | `getAccessToken`                           | Resolve the Supabase access token for a request.                                                                                                                                                                                                                                                           |
|                            | `createSupabaseAccessTokenProvider`        | The `accessToken` callback for supabase-js, bound to one request.                                                                                                                                                                                                                                          |
|                            | `createAccessTokenRouteHandler`            | Route handler that proxies the token to same-origin browser code.                                                                                                                                                                                                                                          |
|                            | `hasPosition`                              | Whether the session holds a position.                                                                                                                                                                                                                                                                      |
|                            | `hasAnyPosition`                           | Whether the session holds at least one of several positions.                                                                                                                                                                                                                                               |
|                            | `hasAllPositions`                          | Whether the session holds every one of several positions.                                                                                                                                                                                                                                                  |
|                            | `isAdmin`                                  | Whether the user is an admin or the primary admin.                                                                                                                                                                                                                                                         |
|                            | `loginUrl`, `logoutUrl`, `accountUrl`      | SGAuth sign-in, sign-out and account URLs.                                                                                                                                                                                                                                                                 |
|                            | Types                                      | `MaybeSession`, `SgauthClient`, `SgauthClientOptions`, `SgauthAccessTokenOptions`, `SgauthUrlOptions`, `SgaSession`, `SgaUser`, `SgaPosition`, `SgaSessionInfo`, `GetSessionInput`, `HeadersLike`, `SgaSessionErrorInfo`, `SgaSessionErrorKind`, `SgaAccessTokenErrorInfo`, `SupabaseAccessTokenProvider`. |
| `@nusgaops/sgauth/next`    | `getServerSession`                         | The session for the current request, or `null`. Cached per request.                                                                                                                                                                                                                                        |
|                            | `requireSession`                           | The session, or a redirect to sign-in. Option type: `RequireSessionOptions`.                                                                                                                                                                                                                               |
|                            | guards and URL builders                    | Re-exports of the guards and URL builders above.                                                                                                                                                                                                                                                           |
| `@nusgaops/sgauth/proxy`   | `createSgaProxy`                           | Builds the `proxy.ts` or `middleware.ts` export. Option type: `SgaProxyOptions`.                                                                                                                                                                                                                           |
|                            | `RETURN_TO_HEADER`                         | Name of the request header that carries the absolute URL being requested.                                                                                                                                                                                                                                  |
| `@nusgaops/sgauth/urls`    | `loginUrl`, `logoutUrl`, `accountUrl`      | The URL builders, safe in the browser.                                                                                                                                                                                                                                                                     |
| `@nusgaops/sgauth/browser` | `createBrowserSupabaseAccessTokenProvider` | The `accessToken` callback for supabase-js in the browser. Option type: `BrowserAccessTokenOptions`.                                                                                                                                                                                                       |

Full API reference: https://sgaoperations.github.io/auth-sdk/ (updated on every release).

Run `npm run docs:api` in a clone of this repository to build the full typedoc reference into `docs/api/`.

### Schemas

The JSON Schemas for the session response ship under `@nusgaops/sgauth/schemas/*`.

## Versioning and support policy

- The package follows [semantic versioning](https://semver.org/spec/v2.0.0.html). Breaking changes land only in a major release. While the version is `0.x`, a minor release may break, and the changelog calls it out.
- The **latest two minor releases** receive bug and security fixes. Older releases receive none; upgrade to a supported minor.
- Node.js and Next.js support follow the `engines` and peer dependency ranges in `package.json`.

## Upgrading

Read [`CHANGELOG.md`](CHANGELOG.md) for every version you skip. Breaking changes appear under an **Upgrade notes** subsection of the release, with the exact code change needed.

## Troubleshooting

- **Redirect loop between your product and sign-in.** `SGAUTH_COOKIE_NAME` does not match the SGAuth environment, or `SGAUTH_URL` is wrong, so `getSession()` fails while SGAuth considers the user signed in. Check both against [Environment variables](#environment-variables).
- **The session is always `null` on a `*.vercel.app` preview.** Expected. Ad-hoc previews cannot use SSO; see [Dev and preview environments](#dev-and-preview-environments).
- **A session is still valid after it was revoked.** See [the bound](#caching-and-availability): up to the TTL normally, and up to the TTL plus `staleIfErrorSeconds` while SGAuth is unreachable.

Deeper troubleshooting lives in the SGAuth integration guide.

## Integration test

`npm run test:integration` signs in to an SGAuth deployment and asserts that sign-out is observed within 60 seconds. It skips unless `SGAUTH_URL`, `SGAUTH_COOKIE_NAME`, `SGAUTH_TEST_EMAIL` and `SGAUTH_TEST_PASSWORD` are set. Use a synthetic account without MFA.

## Contributing

Every pull request must add an entry to [`CHANGELOG.md`](CHANGELOG.md) under Unreleased; CI fails the `Changelog` check otherwise. A change with no user-facing effect (CI, repo tooling, typo fixes) uses the `skip changelog` label instead.

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
