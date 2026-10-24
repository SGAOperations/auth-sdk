import { sha256Hex } from "./session/cache.js";
import { resolveConfig } from "./session/config.js";
import { readCookieHeader, selectSessionCookies } from "./session/cookies.js";
import type { GetSessionInput, SgauthClientOptions } from "./session/types.js";
import {
  createTokenResolver,
  requestToken,
  resolveRefreshSkew,
  type SgaAccessTokenErrorInfo,
  type SupabaseAccessTokenProvider,
  type TokenOutcome,
} from "./token-core.js";

/** Options for the access-token functions. Server-side only. */
export interface SgauthAccessTokenOptions extends Pick<
  SgauthClientOptions,
  "baseUrl" | "cookieName" | "timeoutMs" | "maxEntries" | "fetch"
> {
  /** Called on every upstream failure. Exceptions it throws are discarded. */
  onError?: (info: SgaAccessTokenErrorInfo) => void;
  /** Seconds before the token's `exp` at which it is replaced, 0 to 300. Default 60. */
  refreshSkewSeconds?: number;
}

export interface AccessTokenFetcher {
  /** Resolves the token for the request's cookies. Never throws for an upstream failure. */
  fetchAccessToken(input: GetSessionInput): Promise<TokenOutcome>;
  /** Drops every cached token. */
  clearCache(): void;
}

/**
 * Builds a fetcher with its own cache. Throws `SgauthConfigError` when
 * misconfigured.
 */
export function createAccessTokenFetcher(
  options: SgauthAccessTokenOptions = {},
): AccessTokenFetcher {
  const config = resolveConfig(options);
  const skewSeconds = resolveRefreshSkew(options.refreshSkewSeconds);
  const resolver = createTokenResolver({
    maxEntries: config.maxEntries,
    onError: options.onError,
    request: (forward) => {
      const init: RequestInit & { cache: "no-store" } = {
        method: "GET",
        headers: { cookie: forward, accept: "application/json" },
        // Not in Node's RequestInit typings, but honoured by Next's patched fetch.
        cache: "no-store",
        redirect: "manual",
      };
      return requestToken(
        config.fetch,
        `${config.baseUrl}/api/auth/token`,
        init,
        config.timeoutMs,
        skewSeconds,
      );
    },
  });
  return {
    async fetchAccessToken(input) {
      const { token, forward } = selectSessionCookies(
        readCookieHeader(input),
        config,
      );
      if (token === null) return { status: "unauthenticated" };
      return resolver.resolve(await sha256Hex(token), forward);
    },
    clearCache() {
      resolver.clear();
    },
  };
}

let defaultFetcher: AccessTokenFetcher | undefined;
const fetchersByOptions = new WeakMap<object, AccessTokenFetcher>();

/**
 * The fetcher behind the convenience functions. Without options it is one
 * lazily built instance configured from `SGAUTH_URL` and `SGAUTH_COOKIE_NAME`.
 * With options, each options object gets its own cached instance, so reuse
 * one object rather than passing a fresh literal on every call.
 */
export function fetcherFor(
  options: SgauthAccessTokenOptions | undefined,
): AccessTokenFetcher {
  if (options === undefined)
    return (defaultFetcher ??= createAccessTokenFetcher());
  let fetcher = fetchersByOptions.get(options);
  if (fetcher === undefined) {
    fetcher = createAccessTokenFetcher(options);
    fetchersByOptions.set(options, fetcher);
  }
  return fetcher;
}

/**
 * Resolves a short-lived JWT for the signed-in user, cached until 60 seconds
 * before it expires. Returns `null` when unauthenticated, or when SGAuth is
 * failing and nothing usable is cached. **Server-side only.**
 */
export async function getAccessToken(
  input: GetSessionInput,
  options?: SgauthAccessTokenOptions,
): Promise<string | null> {
  const outcome = await fetcherFor(options).fetchAccessToken(input);
  return outcome.status === "ok" ? outcome.token : null;
}

/**
 * Returns the `accessToken` callback for supabase-js's `createClient`, bound
 * to one request's cookies. **Server-side only.**
 */
export function createSupabaseAccessTokenProvider(
  input: GetSessionInput,
  options?: SgauthAccessTokenOptions,
): SupabaseAccessTokenProvider {
  return () => getAccessToken(input, options);
}
