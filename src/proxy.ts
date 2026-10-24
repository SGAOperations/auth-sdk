import { NextResponse, type NextRequest } from "next/server";
import { resolveCookieName } from "./session/config.js";
import { loginUrl } from "./urls.js";

/** Request header the proxy sets to the absolute URL being requested. */
export const RETURN_TO_HEADER = "x-sgauth-return-to";

export interface SgaProxyOptions {
  /**
   * Paths that need no session. A string matches that path and everything
   * beneath it (`/docs` matches `/docs/a`, not `/docsx`); `"/"` matches only
   * the home page. A RegExp is tested against the pathname.
   */
  publicPaths?: readonly (string | RegExp)[];
}

function isPublic(
  pathname: string,
  publicPaths: readonly (string | RegExp)[],
): boolean {
  return publicPaths.some((path) => {
    if (path instanceof RegExp) {
      path.lastIndex = 0;
      return path.test(pathname);
    }
    const base = path.replace(/\/+$/, "");
    if (base === "") return pathname === "/";
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

/**
 * Builds the function to export from Next's `proxy.ts` (Next 16) or
 * `middleware.ts` (Next 15). It only checks that the SGAuth cookie is present
 * and redirects to sign-in when it is not; it never validates the cookie.
 *
 * It must not call SGAuth. The proxy runs on every request and on every
 * instance, so a network round trip here would add latency to every page and
 * bypass the per-instance session cache. The check is a UX redirect, not a
 * security boundary: `requireSession()` in server code is the boundary and
 * rejects an invalid or revoked cookie. The cookie value is never read or
 * logged here.
 *
 * Unauthenticated `GET` and `HEAD` requests redirect to sign-in; other methods
 * get `401 { "error": "unauthenticated" }` so a Server Action or API call is
 * never redirected to an HTML page. Every other request is forwarded with
 * `x-sgauth-return-to` set to its absolute URL, replacing any client-supplied
 * value.
 */
export function createSgaProxy(
  options: SgaProxyOptions = {},
): (req: NextRequest) => NextResponse {
  const publicPaths = options.publicPaths ?? [];
  const cookieName = resolveCookieName();
  return (req) => {
    const { pathname, href } = req.nextUrl;
    if (pathname.startsWith("/_next/")) return NextResponse.next();

    const headers = new Headers(req.headers);
    headers.set(RETURN_TO_HEADER, href);
    const forward = (): NextResponse =>
      NextResponse.next({ request: { headers } });

    if (isPublic(pathname, publicPaths)) return forward();
    const cookie = req.cookies.get(cookieName);
    if (cookie !== undefined && cookie.value !== "") return forward();

    if (req.method === "GET" || req.method === "HEAD") {
      return NextResponse.redirect(loginUrl(href), 307);
    }
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  };
}
