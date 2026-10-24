import type { ResolvedConfig } from "./config.js";
import type { GetSessionInput, HeadersLike } from "./types.js";

function headerFromLike(headers: HeadersLike): string | null {
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get(name: string): string | null }).get("cookie");
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const value = record["cookie"] ?? record["Cookie"];
  if (Array.isArray(value)) return value.join("; ");
  return value ?? null;
}

/**
 * Reads the raw `Cookie` header from any supported input shape.
 * Throws `TypeError` for anything else.
 */
export function readCookieHeader(input: GetSessionInput): string | null {
  // Callers are server code that may be untyped, so check the shape at runtime.
  const candidate: unknown = input;
  if (typeof candidate === "object" && candidate !== null) {
    if ("headers" in candidate) {
      const { headers } = candidate;
      if (typeof headers === "object" && headers !== null) {
        return headerFromLike(headers as HeadersLike);
      }
    } else if ("cookieHeader" in candidate) {
      const { cookieHeader } = candidate;
      if (cookieHeader === null || cookieHeader === undefined) return null;
      if (typeof cookieHeader === "string") return cookieHeader;
    }
  }
  throw new TypeError(
    "getSession expects { headers } or { cookieHeader: string | null | undefined }",
  );
}

export interface SessionCookies {
  /** The first session-token value, or `null` when there is none. */
  token: string | null;
  /** The filtered `Cookie` header to forward, or `""` when there is no token. */
  forward: string;
}

/**
 * Keeps only the session cookie and its `dont_remember` sibling, in their
 * original order. Values are never decoded or altered.
 */
export function selectSessionCookies(
  header: string | null,
  config: Pick<ResolvedConfig, "cookieName" | "dontRememberCookieName">,
): SessionCookies {
  if (header === null || header === "") return { token: null, forward: "" };
  const kept: string[] = [];
  let token: string | null = null;
  for (const pair of header.split(";")) {
    const trimmed = pair.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name === config.cookieName) {
      token ??= trimmed.slice(eq + 1);
      kept.push(trimmed);
    } else if (name === config.dontRememberCookieName) {
      kept.push(trimmed);
    }
  }
  if (token === null || token === "") return { token: null, forward: "" };
  return { token, forward: kept.join("; ") };
}
