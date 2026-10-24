import { fetcherFor, type SgauthAccessTokenOptions } from "./access-token.js";

const HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json",
} as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

/**
 * A route handler that proxies the signed-in user's token to same-origin
 * browser code, so the SGAuth cookie never has to be readable by client JS.
 * Mount it as `export const GET = createAccessTokenRouteHandler()`.
 *
 * Responds 200 `{ token }`, 401 `{ token: null }`, or 503
 * `{ error: "sgauth_unavailable" }`. Only the SGAuth cookie is forwarded
 * upstream. No CORS headers are added, so only same-origin scripts can read
 * the response.
 */
export function createAccessTokenRouteHandler(
  options?: SgauthAccessTokenOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const outcome = await fetcherFor(options).fetchAccessToken({
      headers: request.headers,
    });
    switch (outcome.status) {
      case "ok":
        return json({ token: outcome.token }, 200);
      case "unauthenticated":
        return json({ token: null }, 401);
      case "error":
        return json({ error: "sgauth_unavailable" }, 503);
    }
  };
}
