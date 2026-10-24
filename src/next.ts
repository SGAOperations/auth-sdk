import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { RETURN_TO_HEADER } from "./proxy.js";
import { getSession } from "./session/client.js";
import type { SgaSession } from "./session/types.js";
import { loginUrl } from "./urls.js";

export * from "./guards.js";
export { accountUrl, loginUrl, logoutUrl } from "./urls.js";
export type { SgauthUrlOptions } from "./urls.js";

/**
 * The session for the current request, or `null`. Wrapped in React's `cache`,
 * so one render pass makes one lookup however many components ask.
 */
export const getServerSession = cache(async (): Promise<SgaSession | null> =>
  getSession({ headers: await headers() }),
);

export interface RequireSessionOptions {
  /** Where SGAuth sends the user after sign-in. Defaults to the URL the proxy recorded. */
  returnTo?: string;
}

function fallbackReturnTo(requestHeaders: {
  get(name: string): string | null;
}): string | undefined {
  const host = requestHeaders.get("host");
  if (host === null) return undefined;
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}/`;
}

/**
 * Returns the session, or redirects to SGAuth sign-in. This is the security
 * boundary: unlike the proxy it validates the cookie, so an invalid or revoked
 * one is rejected. Works in server components, Server Actions and route
 * handlers, because Next's `redirect` throws.
 */
export async function requireSession(
  options: RequireSessionOptions = {},
): Promise<SgaSession> {
  const session = await getServerSession();
  if (session !== null) return session;
  const requestHeaders = await headers();
  const returnTo =
    options.returnTo ??
    requestHeaders.get(RETURN_TO_HEADER) ??
    fallbackReturnTo(requestHeaders);
  return redirect(loginUrl(returnTo));
}
