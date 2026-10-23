import { SessionCache, sha256Hex } from "./cache.js";
import { resolveConfig, type ResolvedConfig } from "./config.js";
import { readCookieHeader, selectSessionCookies } from "./cookies.js";
import { parseSession } from "./parse.js";
import type {
  GetSessionInput,
  SgaSession,
  SgaSessionErrorInfo,
  SgauthClientOptions,
} from "./types.js";

export interface SgauthClient {
  /**
   * Resolves the SGAuth session for the request's cookies. Returns `null` when
   * unauthenticated, or when SGAuth is failing and nothing usable is cached.
   * Upstream failures are reported through `onError`, never thrown.
   */
  getSession(input: GetSessionInput): Promise<SgaSession | null>;
  /** Drops every cached session. */
  clearCache(): void;
}

type Failure = Omit<SgaSessionErrorInfo, "servedStale">;

class UpstreamFailure extends Error {
  constructor(readonly info: Failure) {
    super(info.kind);
  }
}

class TimeoutSignal extends Error {}

async function requestSession(
  config: ResolvedConfig,
  forward: string,
): Promise<SgaSession | null> {
  const controller = new AbortController();
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new TimeoutSignal());
    });
  });
  const timer = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);
  try {
    const attempt = (async (): Promise<SgaSession | null> => {
      const init: RequestInit & { cache: "no-store" } = {
        method: "GET",
        headers: { cookie: forward, accept: "application/json" },
        // Not in Node's RequestInit typings, but honoured by Next's patched fetch.
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      };
      const response = await config.fetch(
        `${config.baseUrl}/api/sgauth/session`,
        init,
      );
      if (response.status === 401) return null;
      if (response.status !== 200) {
        throw new UpstreamFailure({ kind: "http", status: response.status });
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new UpstreamFailure({
          kind: "invalid-response",
          status: response.status,
        });
      }
      const session = parseSession(body);
      if (session === null) {
        throw new UpstreamFailure({
          kind: "invalid-response",
          status: response.status,
        });
      }
      return session;
    })();
    // Losing the race must not leave the attempt's rejection unhandled.
    attempt.catch(() => undefined);
    return await Promise.race([attempt, aborted]);
  } catch (error) {
    if (error instanceof UpstreamFailure) throw error;
    if (error instanceof TimeoutSignal || controller.signal.aborted) {
      throw new UpstreamFailure({ kind: "timeout" });
    }
    throw new UpstreamFailure({ kind: "network" });
  } finally {
    clearTimeout(timer);
  }
}

/** Creates a client with its own cache. Throws `SgauthConfigError` when misconfigured. */
export function createSgauthClient(
  options: SgauthClientOptions = {},
): SgauthClient {
  const config = resolveConfig(options);
  const cache = new SessionCache(config.maxEntries);
  const inflight = new Map<string, Promise<SgaSession | null>>();

  function report(failure: Failure, servedStale: boolean): void {
    if (config.onError === undefined) return;
    try {
      config.onError({ ...failure, servedStale });
    } catch {
      // A throwing callback must never break authentication.
    }
  }

  async function refresh(
    key: string,
    forward: string,
  ): Promise<SgaSession | null> {
    try {
      const session = await requestSession(config, forward);
      if (session === null) {
        cache.setNegative(key, config.negativeTtlSeconds);
      } else {
        cache.setSession(
          key,
          session,
          config.cacheTtlSeconds,
          config.staleIfErrorSeconds,
        );
      }
      return session;
    } catch (error) {
      if (!(error instanceof UpstreamFailure)) throw error;
      // Re-read the cache: the stale window is measured from now, not from
      // the start of a request that may have just spent its whole timeout.
      const lookup = cache.get(key);
      const fallback = lookup.state === "miss" ? null : lookup.value;
      report(error.info, fallback !== null);
      return fallback;
    }
  }

  return {
    async getSession(input) {
      const { token, forward } = selectSessionCookies(
        readCookieHeader(input),
        config,
      );
      if (token === null) return null;
      const key = await sha256Hex(token);
      const lookup = cache.get(key);
      if (lookup.state === "fresh") return lookup.value;
      const pending = inflight.get(key);
      if (pending !== undefined) return pending;
      const request = refresh(key, forward).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, request);
      return request;
    },
    clearCache() {
      cache.clear();
    },
  };
}

let defaultClient: SgauthClient | undefined;

/**
 * `getSession` backed by a lazily built client configured from `SGAUTH_URL`
 * and `SGAUTH_COOKIE_NAME`. Server-side only.
 */
export async function getSession(
  input: GetSessionInput,
): Promise<SgaSession | null> {
  defaultClient ??= createSgauthClient();
  return defaultClient.getSession(input);
}
