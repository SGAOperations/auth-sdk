/**
 * Reads the `exp` claim (seconds since the epoch) from a JWT payload without
 * verifying the signature. Returns `null` for anything malformed; never throws.
 *
 * Verification is not this function's job: the token comes from SGAuth over
 * HTTPS and the product that consumes it verifies it against the JWKS. This
 * only schedules a refresh. It has no Node imports because the browser entry
 * bundles it.
 */
export function decodeJwtExp(token: string): number | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const payload = segments[1];
  if (payload === undefined || payload === "") return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof claims !== "object" || claims === null) return null;
    const exp = (claims as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}
