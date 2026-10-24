import { setImmediate as realTick } from "node:timers/promises";
import type { vi } from "vitest";

/** Builds an unsigned JWT whose payload carries `exp`, with a `jti` so tokens differ. */
export function makeJwt(exp: number, jti = "a"): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "ES256" })}.${encode({ exp, jti })}.sig`;
}

/** Epoch seconds, read from the (possibly fake) clock. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function tokenResponse(token: string): Response {
  return new Response(JSON.stringify({ token }), { status: 200 });
}

export function statusResponse(code: number): Response {
  return new Response(null, { status: code });
}

export const never = (): Promise<Response> => new Promise(() => undefined);

export type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

/**
 * Waits, on the real clock, until the code under test has reached `fetch`.
 * Hashing the cookie is asynchronous, so fake timers alone cannot tell when
 * the request (and therefore its timeout timer) exists.
 */
export async function untilCalls(
  fetchMock: FetchMock,
  count: number,
): Promise<void> {
  while (fetchMock.mock.calls.length < count) await realTick();
}
