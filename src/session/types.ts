/** The signed-in user, as returned by SGAuth. */
export interface SgaUser {
  id: string;
  email: string;
  name: string;
  preferredName: string | null;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
}

/** A position the user currently holds. */
export interface SgaPosition {
  key: string;
  name: string;
}

/** Session timing. All values are ISO 8601 strings so a session stays serializable. */
export interface SgaSessionInfo {
  id: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  createdAt: string;
}

/** The body of a successful `GET /api/sgauth/session` response. */
export interface SgaSession {
  user: SgaUser;
  positions: SgaPosition[];
  session: SgaSessionInfo;
}

/**
 * Anything that exposes request headers: a `Headers` instance, Next's
 * `ReadonlyHeaders`, or Node's `IncomingHttpHeaders`.
 */
export type HeadersLike =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

/** What to read the session cookie from. */
export type GetSessionInput =
  { headers: HeadersLike } | { cookieHeader: string | null | undefined };

/** Why an upstream call failed. */
export type SgaSessionErrorKind =
  "timeout" | "network" | "http" | "invalid-response";

/**
 * Reported to `onError` when SGAuth could not be reached or answered
 * unexpectedly. Never carries the cookie, the token, or request headers.
 */
export interface SgaSessionErrorInfo {
  kind: SgaSessionErrorKind;
  /** The HTTP status, for `http` and `invalid-response` failures. */
  status?: number;
  /** Whether a previously cached session was returned despite the failure. */
  servedStale: boolean;
}

export interface SgauthClientOptions {
  /** SGAuth origin. Defaults to `SGAUTH_URL`. */
  baseUrl?: string;
  /** Session cookie name. Defaults to `SGAUTH_COOKIE_NAME`, then `__Secure-sgauth.session_token`. */
  cookieName?: string;
  /** Fresh-cache lifetime in seconds, 1 to 300. Default 60. */
  cacheTtlSeconds?: number;
  /** How long past the TTL a cached session may be served while SGAuth is failing, 0 to 900. Default 300. */
  staleIfErrorSeconds?: number;
  /** Request timeout in milliseconds, 1 to 10000. Default 3000. */
  timeoutMs?: number;
  /** Maximum cached sessions. Default 5000. */
  maxEntries?: number;
  /** Fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Called on every upstream failure. Exceptions it throws are discarded. */
  onError?: (info: SgaSessionErrorInfo) => void;
}
