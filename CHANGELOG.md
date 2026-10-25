# Changelog

All notable changes to `@nusgaops/sgauth` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Breaking changes are listed under an **Upgrade notes** subsection of the release, with the exact code change needed:

```md
### Upgrade notes

- `oldName()` is now `newName()`: replace the import and the call.
```

## [Unreleased]

- Added `getSession()` and `createSgauthClient()`: server-side session lookup with cookie forwarding, a 60-second in-memory cache, and stale-if-error fallback.
- Added `getAccessToken()`, `createSupabaseAccessTokenProvider()` and `createAccessTokenRouteHandler()`, plus `createBrowserSupabaseAccessTokenProvider()` from the new `@nusgaops/sgauth/browser` subpath: SGAuth JWTs for Supabase clients, cached until 60 seconds before expiry.
- Added Next.js helpers: `loginUrl()`, `logoutUrl()` and `accountUrl()` (`@nusgaops/sgauth/urls`), `createSgaProxy()` for `proxy.ts` / `middleware.ts` (`@nusgaops/sgauth/proxy`), `getServerSession()` and `requireSession()` (`@nusgaops/sgauth/next`), and the `hasPosition()`, `hasAnyPosition()`, `hasAllPositions()` and `isAdmin()` guards. `next` and `react` are optional peer dependencies.
- Vendored the SGAuth session JSON Schemas into `schemas/`, byte-for-byte from `SGAOperations/auth` `docs/api/` at commit `0058eb55bd07cb3dead997fd47c88cd744e62ae4`. They are importable as `@nusgaops/sgauth/schemas/*`.
- Documentation: a consumer README (install, environment variables, quick start, caching and availability bounds, dev and preview topology, support policy), a README and `.env.example` for the example app, and TSDoc on the session types. Added the type-only export `MaybeSession` from the root entry.

## [0.1.0]

- Initial package scaffold and release pipeline. No public API beyond `version`.
