/** The signed-in user, as returned by SGAuth. */
export interface SgaUser {
  /** Stable SGAuth user id. */
  id: string;
  /** The user's email address. */
  email: string;
  /** The user's full name. */
  name: string;
  /** The name the user prefers to be called, or `null` when unset. */
  preferredName: string | null;
  /** Whether the user is an admin. */
  isAdmin: boolean;
  /** Whether the user is the primary admin. */
  isPrimaryAdmin: boolean;
}

/** A position the user currently holds. */
export interface SgaPosition {
  /** Stable position key, such as `vp-finance`. Pass it to the guards. */
  key: string;
  /** Human-readable position name. */
  name: string;
}

/** Session timing. All values are ISO 8601 strings so a session stays serializable. */
export interface SgaSessionInfo {
  /** SGAuth session id. */
  id: string;
  /** When the session expires if it is not extended. */
  expiresAt: string;
  /** When the session expires regardless of activity. */
  absoluteExpiresAt: string;
  /** When the session was created. */
  createdAt: string;
}

/** The body of a successful `GET /api/sgauth/session` response. */
export interface SgaSession {
  /** The signed-in user. */
  user: SgaUser;
  /** The positions the user currently holds. */
  positions: SgaPosition[];
  /** Timing of the session itself. */
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
  /** What kind of failure it was. */
  kind: SgaSessionErrorKind;
  /** The HTTP status, for `http` and `invalid-response` failures. */
  status?: number;
  /** Whether a previously cached session was returned despite the failure. */
  servedStale: boolean;
}

/** Options for `createSgauthClient()`. Every option has a default except the base URL. */
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
