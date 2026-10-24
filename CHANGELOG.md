# Changelog

All notable changes to `@nusgaops/sgauth` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Added `getSession()` and `createSgauthClient()`: server-side session lookup with cookie forwarding, a 60-second in-memory cache, and stale-if-error fallback.
- Vendored the SGAuth session JSON Schemas into `schemas/`, byte-for-byte from `SGAOperations/auth` `docs/api/` at commit `0058eb55bd07cb3dead997fd47c88cd744e62ae4`. They are importable as `@nusgaops/sgauth/schemas/*`.

## [0.1.0]

- Initial package scaffold and release pipeline. No public API beyond `version`.
