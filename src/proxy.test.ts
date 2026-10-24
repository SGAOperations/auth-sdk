import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSgaProxy, RETURN_TO_HEADER } from "./proxy.js";

const COOKIE = "__Secure-sgauth.session_token";
const FORWARDED_PREFIX = "x-middleware-request-";

function request(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(url, init);
}

function signedIn(url: string, extra: Record<string, string> = {}) {
  return request(url, { headers: { cookie: `${COOKIE}=abc`, ...extra } });
}

beforeEach(() => {
  vi.stubEnv("SGAUTH_URL", "https://auth.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function forwardedReturnTo(response: Response): string | null {
  return response.headers.get(`${FORWARDED_PREFIX}${RETURN_TO_HEADER}`);
}

describe("createSgaProxy", () => {
  it("forwards a request that carries the cookie, setting the return-to header", () => {
    const proxy = createSgaProxy();
    const response = proxy(signedIn("https://app.example.com/page?x=1"));
    expect(response.status).toBe(200);
    expect(forwardedReturnTo(response)).toBe(
      "https://app.example.com/page?x=1",
    );
  });

  it("overwrites a spoofed return-to header", () => {
    const proxy = createSgaProxy();
    const response = proxy(
      signedIn("https://app.example.com/page", {
        [RETURN_TO_HEADER]: "https://evil.example.net/",
      }),
    );
    expect(forwardedReturnTo(response)).toBe("https://app.example.com/page");
  });

  it("matches public paths exactly, by sub-path, and by RegExp", () => {
    const proxy = createSgaProxy({
      publicPaths: ["/", "/docs", /^\/api\/health$/],
    });
    for (const path of ["/", "/docs", "/docs/a/b", "/api/health"]) {
      const response = proxy(request(`https://app.example.com${path}`));
      expect(response.status, path).toBe(200);
    }
    for (const path of ["/docsx", "/private", "/api/health/x"]) {
      const response = proxy(request(`https://app.example.com${path}`));
      expect(response.status, path).toBe(307);
    }
  });

  it("skips /_next/ paths", () => {
    const response = createSgaProxy()(
      request("https://app.example.com/_next/static/a.js"),
    );
    expect(response.status).toBe(200);
    expect(forwardedReturnTo(response)).toBeNull();
  });

  it("redirects a cookie-less GET to the encoded login URL", () => {
    const response = createSgaProxy()(
      request("https://app.example.com/protected?a=1&b=2"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://auth.example.com/login?redirect=https%3A%2F%2Fapp.example.com%2Fprotected%3Fa%3D1%26b%3D2",
    );
  });

  it("treats an empty cookie as absent", () => {
    const response = createSgaProxy()(
      request("https://app.example.com/protected", {
        headers: { cookie: `${COOKIE}=` },
      }),
    );
    expect(response.status).toBe(307);
  });

  it("answers a cookie-less POST with 401 JSON", async () => {
    const response = createSgaProxy()(
      request("https://app.example.com/api/thing", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("honours SGAUTH_COOKIE_NAME", () => {
    vi.stubEnv("SGAUTH_COOKIE_NAME", "sgauth-local.session_token");
    const proxy = createSgaProxy();
    expect(proxy(signedIn("https://app.example.com/protected")).status).toBe(
      307,
    );
    const response = proxy(
      request("https://app.example.com/protected", {
        headers: { cookie: "sgauth-local.session_token=abc" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("never calls fetch", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const proxy = createSgaProxy();
    proxy(signedIn("https://app.example.com/a"));
    proxy(request("https://app.example.com/a"));
    expect(spy).not.toHaveBeenCalled();
  });
});
