import type { SgaSessionErrorInfo, SgauthClientOptions } from "./types.js";

const DEFAULT_COOKIE_NAME = "__Secure-sgauth.session_token";
const SESSION_TOKEN_SUFFIX = ".session_token";
const DONT_REMEMBER_SUFFIX = ".dont_remember";
const NEGATIVE_TTL_SECONDS = 10;

/** Thrown when the client is misconfigured. Messages name the option, never its value. */
export class SgauthConfigError extends Error {
  override readonly name = "SgauthConfigError";
}

export interface ResolvedConfig {
  readonly baseUrl: string;
  readonly cookieName: string;
  readonly dontRememberCookieName: string | null;
  readonly cacheTtlSeconds: number;
  readonly negativeTtlSeconds: number;
  readonly staleIfErrorSeconds: number;
  readonly timeoutMs: number;
  readonly maxEntries: number;
  readonly fetch: typeof fetch;
  readonly onError: ((info: SgaSessionErrorInfo) => void) | undefined;
}

function integerInRange(
  option: string,
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new SgauthConfigError(
      `${option} must be an integer from ${String(min)} to ${String(max)}`,
    );
  }
  return resolved;
}

function resolveBaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw === "") {
    throw new SgauthConfigError(
      "baseUrl is required: pass it or set SGAUTH_URL",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SgauthConfigError("baseUrl must be an absolute http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SgauthConfigError("baseUrl must be an absolute http(s) URL");
  }
  return raw.replace(/\/+$/, "");
}

function deriveDontRememberName(cookieName: string): string | null {
  return cookieName.endsWith(SESSION_TOKEN_SUFFIX)
    ? cookieName.slice(0, -SESSION_TOKEN_SUFFIX.length) + DONT_REMEMBER_SUFFIX
    : null;
}

/** Folds options and environment into a frozen, range-checked config. */
export function resolveConfig(
  options: SgauthClientOptions = {},
  env: Record<string, string | undefined> = process.env,
): ResolvedConfig {
  const cookieName =
    options.cookieName ?? env["SGAUTH_COOKIE_NAME"] ?? DEFAULT_COOKIE_NAME;
  if (cookieName === "") {
    throw new SgauthConfigError("cookieName must not be empty");
  }
  const cacheTtlSeconds = integerInRange(
    "cacheTtlSeconds",
    options.cacheTtlSeconds,
    60,
    1,
    300,
  );
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new SgauthConfigError(
      "fetch is not available: pass a fetch implementation",
    );
  }
  return Object.freeze({
    baseUrl: resolveBaseUrl(options.baseUrl ?? env["SGAUTH_URL"]),
    cookieName,
    dontRememberCookieName: deriveDontRememberName(cookieName),
    cacheTtlSeconds,
    negativeTtlSeconds: Math.min(NEGATIVE_TTL_SECONDS, cacheTtlSeconds),
    staleIfErrorSeconds: integerInRange(
      "staleIfErrorSeconds",
      options.staleIfErrorSeconds,
      300,
      0,
      900,
    ),
    timeoutMs: integerInRange("timeoutMs", options.timeoutMs, 3000, 1, 10000),
    maxEntries: integerInRange(
      "maxEntries",
      options.maxEntries,
      5000,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    fetch: fetchImpl,
    onError: options.onError,
  });
}
