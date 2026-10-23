import { describe, expect, it } from "vitest";
import { createSgauthClient } from "../../src/index.js";

const url = process.env["SGAUTH_URL"];
const cookieName = process.env["SGAUTH_COOKIE_NAME"];
const email = process.env["SGAUTH_TEST_EMAIL"];
const password = process.env["SGAUTH_TEST_PASSWORD"];

const configured =
  url !== undefined &&
  cookieName !== undefined &&
  email !== undefined &&
  password !== undefined;

const POLL_INTERVAL_MS = 5_000;
const BUDGET_MS = 65_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!configured)("revocation against auth-dev", () => {
  it("observes a sign-out within 60 s", async () => {
    const base = (url ?? "").replace(/\/+$/, "");
    const origin = new URL(base).origin;

    const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    });
    expect(signIn.status).toBe(200);
    const sessionCookie = signIn.headers
      .getSetCookie()
      .map((line) => line.split(";")[0] ?? "")
      .find((pair) => pair.startsWith(`${cookieName ?? ""}=`));
    expect(sessionCookie).toBeDefined();
    const cookieHeader = sessionCookie ?? "";

    const client = createSgauthClient({ baseUrl: base });
    const session = await client.getSession({ cookieHeader });
    expect(session?.user.email).toBe(email);

    const signOut = await fetch(`${base}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: cookieHeader,
      },
      body: "{}",
    });
    expect(signOut.ok).toBe(true);

    const revokedAt = Date.now();
    let observed: Awaited<ReturnType<typeof client.getSession>> = session;
    while (observed !== null && Date.now() - revokedAt < BUDGET_MS) {
      await sleep(POLL_INTERVAL_MS);
      observed = await client.getSession({ cookieHeader });
    }
    const elapsedMs = Date.now() - revokedAt;
    console.log(
      `revocation observed after ${String(Math.round(elapsedMs / 1000))} s`,
    );
    expect(observed).toBeNull();
    expect(elapsedMs).toBeLessThanOrEqual(BUDGET_MS);
  });
});
