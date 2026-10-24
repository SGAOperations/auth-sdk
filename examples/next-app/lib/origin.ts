import { headers } from "next/headers";

/** This app's own origin, from the request headers. */
export async function appOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost";
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}
