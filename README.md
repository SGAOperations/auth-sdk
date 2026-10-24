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

Pre-1.0. The package exports `version`, the server-side session API, the Supabase access-token API and the Next.js helpers below.

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

`getAccessToken`, `createSupabaseAccessTokenProvider` and `createAccessTokenRouteHandler` take an optional options object: `baseUrl`, `cookieName`, `timeoutMs`, `maxEntries`, `fetch` and `onError`, as in [Configuration](#configuration), plus `refreshSkewSeconds` (default 60, clamped to 0 to 300). Each options object gets its own cache, so create it once and reuse it rather than passing a fresh literal on every call.

The browser provider takes `endpoint` (default `/api/sgauth/token`), `refreshSkewSeconds`, `timeoutMs` (default 3000), `onError` and `fetch`.

### Behaviour and caveats

- Concurrent callers share one request. A token is replaced once `exp - refreshSkewSeconds` passes.
- **Revocation takes effect at the next refresh.** A revoked session keeps its cached token for up to about 9 minutes, and the JWT itself stays valid until its `exp`. A 401 or 403 drops the cached token, and nothing is cached for a signed-out user.
- **Fail closed.** On a timeout, network error, 429, 5xx or malformed response, the cached token is served only while it has more than 10 seconds left, and `onError` is called. With nothing usable cached the result is `null` (the route answers 503). Failures are never cached.
- `onError` receives `{ kind, status, servedStale }`, never a cookie or a token.
- **Never log the forwarded `Cookie` header or the token.**

### Schemas

The JSON Schemas for the session response ship under `@nusgaops/sgauth/schemas/*`.

### Integration test

`npm run test:integration` signs in to an SGAuth deployment and asserts that sign-out is observed within 60 seconds. It skips unless `SGAUTH_URL`, `SGAUTH_COOKIE_NAME`, `SGAUTH_TEST_EMAIL` and `SGAUTH_TEST_PASSWORD` are set. Use a synthetic account without MFA.

## Next.js

Helpers for Next 15 and later (`next` and `react` are optional peer dependencies, so other products install cleanly). Each runtime gets its own entry:

| Entry                    | Runs in                | Exports                                                                                                               |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@nusgaops/sgauth/urls`  | server or browser      | `loginUrl`, `logoutUrl`, `accountUrl`                                                                                 |
| `@nusgaops/sgauth/proxy` | edge runtime           | `createSgaProxy`                                                                                                      |
| `@nusgaops/sgauth/next`  | server only            | `getServerSession`, `requireSession`, the guards and the URL builders. Importing it from client code fails the build. |
| `@nusgaops/sgauth`       | server (plain Node ok) | `getSession`, the guards and the URL builders                                                                         |

### Environment

- `SGAUTH_URL`: the SGAuth origin, read by server code.
- `NEXT_PUBLIC_SGAUTH_URL`: the same origin, for the URL builders in client bundles. Optional on the server, where `SGAUTH_URL` is used.
- `SGAUTH_COOKIE_NAME`: only when it differs from `__Secure-sgauth.session_token`.

### Protect routes

```ts
// proxy.ts (Next 16). In Next 15, name the file middleware.ts and export `middleware` instead.
import { createSgaProxy } from "@nusgaops/sgauth/proxy";

export const proxy = createSgaProxy({
  publicPaths: ["/", "/docs", /^\/api\/health$/],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

A string in `publicPaths` matches that path and everything beneath it (`/docs` matches `/docs/a`, not `/docsx`); `"/"` matches only the home page. A request without the SGAuth cookie is redirected to sign-in (`GET` and `HEAD`) or answered `401 { "error": "unauthenticated" }` (other methods). The proxy also sets an `x-sgauth-return-to` request header to the absolute URL, replacing any client-supplied value, so `requireSession()` can send the user back where they were.

Then validate in server code:

```tsx
// app/protected/page.tsx
import { requireSession } from "@nusgaops/sgauth/next";

export default async function Page() {
  const session = await requireSession(); // redirects to sign-in when invalid or revoked
  return <p>Hello, {session.user.preferredName ?? session.user.name}</p>;
}
```

```ts
// A Server Action: check on the server, not just in the UI.
"use server";
import { hasPosition, requireSession } from "@nusgaops/sgauth/next";

export async function approvePurchase() {
  const session = await requireSession();
  if (!hasPosition(session, "vp-finance")) return;
  // ...
}
```

`requireSession()` works in server components, Server Actions and route handlers. `getServerSession()` returns `SgaSession | null` without redirecting. It is wrapped in React's `cache`, so one request makes one SGAuth lookup however many components ask.

Guards take `SgaSession | null | undefined` and treat no session as no access:

- `hasPosition(session, key)`
- `hasAnyPosition(session, keys)` and `hasAllPositions(session, keys)`, both `false` for an empty `keys` so nothing is granted vacuously
- `isAdmin(session)`: an admin or the primary admin

Guards throw if called in the browser. Only the URL builders are browser-safe. Render logout as a plain `<a href={logoutUrl(origin)}>`, never a prefetching `<Link>`.

### Why the proxy never calls SGAuth

The proxy runs on every request and on every instance. A network round trip there would add latency to every page, and it would bypass the per-instance session cache that `getSession()` relies on. So it only checks that the cookie exists. That is a UX redirect, not a security boundary: `requireSession()` is the boundary, and it rejects an invalid or revoked cookie.

If a product keeps bouncing between sign-in and itself, `getSession()` is failing while SGAuth considers the user signed in. Check `SGAUTH_URL` first.

`__Secure-` cookies need HTTPS, so plain `localhost` always looks signed out when testing locally.

### Example app

`examples/next-app/` shows a protected page, a position-gated Server Action and logout. See its README.

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
