import { decodeJwtExp } from "./jwt-exp.js";
import type { SgaSessionErrorInfo } from "./session/types.js";

// Shared by the server fetcher and the browser provider. No Node imports: the
// browser entry bundles this file.

/** The `accessToken` callback shape that supabase-js's `createClient` expects. */
export type SupabaseAccessTokenProvider = () => Promise<string | null>;

/**
 * Reported to `onError` when SGAuth, or the product route in front of it,
 * could not be reached or answered unexpectedly. Same shape as the session
 * client's. Never carries a cookie or a token.
 */
export type SgaAccessTokenErrorInfo = SgaSessionErrorInfo;

type FailureInfo = Omit<SgaAccessTokenErrorInfo, "servedStale">;

const DEFAULT_REFRESH_SKEW_SECONDS = 60;
const MAX_REFRESH_SKEW_SECONDS = 300;
/** A cached token is only served on error while it has more than this left. */
const MIN_REMAINING_MS = 10_000;

/** Seconds before `exp` at which a token is replaced, clamped to 0 to 300. */
export function resolveRefreshSkew(value: number | undefined): number {
  const skew = value ?? DEFAULT_REFRESH_SKEW_SECONDS;
  if (Number.isNaN(skew)) return DEFAULT_REFRESH_SKEW_SECONDS;
  return Math.min(MAX_REFRESH_SKEW_SECONDS, Math.max(0, skew));
}

export interface CachedToken {
  token: string;
  /** Milliseconds since the epoch at which the token itself expires. */
  expiresAt: number;
  /** Milliseconds since the epoch at which it should be replaced. */
  refreshAt: number;
}

/** Why a request did not produce a token. */
export class TokenFailure extends Error {
  constructor(readonly info: FailureInfo) {
    super(info.kind);
  }
}

class TimeoutSignal extends Error {}

/**
 * Runs `run` with an abort signal that fires after `timeoutMs`. A timeout
 * rejects with `TimeoutSignal` even when the work rejects first with an
 * `AbortError`.
 */
async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new TimeoutSignal());
    });
  });
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const attempt = run(controller.signal);
    // Losing the race must not leave the attempt's rejection unhandled.
    attempt.catch(() => undefined);
    return await Promise.race([attempt, aborted]);
  } catch (error) {
    if (controller.signal.aborted) throw new TimeoutSignal();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Releases an unread body so the connection can be reused. Never throws or waits. */
function discardBody(response: Response): void {
  try {
    response.body?.cancel().catch(() => undefined);
  } catch {
    // Best effort only.
  }
}

export type UpstreamResult =
  ({ status: "ok" } & CachedToken) | { status: "unauthenticated" };

function parseTokenBody(
  body: unknown,
  skewSeconds: number,
): CachedToken | null {
  if (typeof body !== "object" || body === null) return null;
  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || token === "") return null;
  const exp = decodeJwtExp(token);
  if (exp === null) return null;
  return {
    token,
    expiresAt: exp * 1000,
    refreshAt: (exp - skewSeconds) * 1000,
  };
}

/**
 * One request for a token. 401 and 403 mean there is no session. Anything
 * else that is not a well-formed 200 throws `TokenFailure`.
 */
export async function requestToken(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  skewSeconds: number,
): Promise<UpstreamResult> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(url, { ...init, signal });
      if (response.status === 401 || response.status === 403) {
        discardBody(response);
        return { status: "unauthenticated" } as const;
      }
      if (response.status !== 200) {
        discardBody(response);
        throw new TokenFailure({ kind: "http", status: response.status });
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new TokenFailure({
          kind: "invalid-response",
          status: response.status,
        });
      }
      const parsed = parseTokenBody(body, skewSeconds);
      if (parsed === null) {
        throw new TokenFailure({
          kind: "invalid-response",
          status: response.status,
        });
      }
      return { status: "ok", ...parsed } as const;
    });
  } catch (error) {
    if (error instanceof TokenFailure) throw error;
    if (error instanceof TimeoutSignal)
      throw new TokenFailure({ kind: "timeout" });
    throw new TokenFailure({ kind: "network" });
  }
}

export type TokenOutcome =
  | { status: "ok"; token: string }
  | { status: "unauthenticated" }
  | { status: "error"; error: SgaAccessTokenErrorInfo };

export interface TokenResolver {
  /** Resolves the token for `key`, requesting it with `arg` when needed. */
  resolve(key: string, arg: string): Promise<TokenOutcome>;
  clear(): void;
}

export interface TokenResolverOptions {
  maxEntries: number;
  request: (arg: string) => Promise<UpstreamResult>;
  onError: ((info: SgaAccessTokenErrorInfo) => void) | undefined;
}

/**
 * A bounded LRU of tokens that are replaced at `refreshAt`, with one request
 * in flight per key. Timestamps come from `Date.now()` so fake timers drive
 * them.
 *
 * A failed refresh serves the cached token only while it has more than 10
 * seconds left, and reports through `onError`. A 401 drops the entry and is
 * never served stale. Failures are never cached.
 */
export function createTokenResolver(
  options: TokenResolverOptions,
): TokenResolver {
  const entries = new Map<string, CachedToken>();
  const inflight = new Map<string, Promise<TokenOutcome>>();

  function report(failure: FailureInfo, servedStale: boolean): void {
    if (options.onError === undefined) return;
    try {
      options.onError({ ...failure, servedStale });
    } catch {
      // A throwing callback must never break authentication.
    }
  }

  function store(key: string, entry: CachedToken): void {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > options.maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done === true) break;
      entries.delete(oldest.value);
    }
  }

  async function refresh(key: string, arg: string): Promise<TokenOutcome> {
    try {
      const result = await options.request(arg);
      if (result.status === "unauthenticated") {
        entries.delete(key);
        return result;
      }
      if (result.refreshAt > Date.now()) store(key, result);
      return { status: "ok", token: result.token };
    } catch (error) {
      if (!(error instanceof TokenFailure)) throw error;
      // Re-read the entry: the margin is measured from now, not from the
      // start of a request that may have just spent its whole timeout.
      const cached = entries.get(key);
      const usable =
        cached !== undefined &&
        Date.now() < cached.expiresAt - MIN_REMAINING_MS;
      report(error.info, usable);
      if (usable) return { status: "ok", token: cached.token };
      return {
        status: "error",
        error: { ...error.info, servedStale: false },
      };
    }
  }

  return {
    async resolve(key, arg) {
      const cached = entries.get(key);
      if (cached !== undefined) {
        const now = Date.now();
        if (now < cached.refreshAt) {
          entries.delete(key);
          entries.set(key, cached);
          return { status: "ok", token: cached.token };
        }
        if (now >= cached.expiresAt) entries.delete(key);
      }
      const pending = inflight.get(key);
      if (pending !== undefined) return pending;
      const request = refresh(key, arg).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, request);
      return request;
    },
    clear() {
      entries.clear();
    },
  };
}
