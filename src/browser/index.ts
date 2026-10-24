import {
  createTokenResolver,
  requestToken,
  resolveRefreshSkew,
  type SgaAccessTokenErrorInfo,
  type SupabaseAccessTokenProvider,
} from "../token-core.js";

export type { SgaAccessTokenErrorInfo, SupabaseAccessTokenProvider };

const DEFAULT_ENDPOINT = "/api/sgauth/token";
const DEFAULT_TIMEOUT_MS = 3000;

export interface BrowserAccessTokenOptions {
  /** The product route created by `createAccessTokenRouteHandler()`. Default `/api/sgauth/token`. */
  endpoint?: string;
  /** Seconds before the token's `exp` at which it is replaced, 0 to 300. Default 60. */
  refreshSkewSeconds?: number;
  /** Request timeout in milliseconds. Default 3000. */
  timeoutMs?: number;
  /** Called on every failure. Exceptions it throws are discarded. */
  onError?: (info: SgaAccessTokenErrorInfo) => void;
  /** Fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/**
 * Returns the `accessToken` callback for supabase-js's `createClient` in the
 * browser. Tokens come from a same-origin product route that proxies to
 * SGAuth, so no SGAuth cookie is exposed to client JS. The token is cached
 * until shortly before it expires. A signed-out user gets `null`.
 */
export function createBrowserSupabaseAccessTokenProvider(
  options: BrowserAccessTokenOptions = {},
): SupabaseAccessTokenProvider {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const skewSeconds = resolveRefreshSkew(options.refreshSkewSeconds);
  const fetchImpl: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  // `cache` is a standard fetch option that Node's RequestInit typings omit.
  const init: RequestInit & { cache: "no-store" } = {
    credentials: "same-origin",
    cache: "no-store",
  };
  const resolver = createTokenResolver({
    maxEntries: 1,
    onError: options.onError,
    request: () =>
      requestToken(fetchImpl, endpoint, init, timeoutMs, skewSeconds),
  });
  return async () => {
    const outcome = await resolver.resolve("token", "");
    return outcome.status === "ok" ? outcome.token : null;
  };
}
