import { describe, expect, it, vi } from "vitest";
import { resolveConfig, SgauthConfigError } from "./config.js";

const env = { SGAUTH_URL: "https://auth.example.com/" };

describe("resolveConfig", () => {
  it("applies defaults and strips the trailing slash", () => {
    const config = resolveConfig({}, env);
    expect(config.baseUrl).toBe("https://auth.example.com");
    expect(config.cookieName).toBe("__Secure-sgauth.session_token");
    expect(config.dontRememberCookieName).toBe("__Secure-sgauth.dont_remember");
    expect(config.cacheTtlSeconds).toBe(60);
    expect(config.negativeTtlSeconds).toBe(10);
    expect(config.staleIfErrorSeconds).toBe(300);
    expect(config.timeoutMs).toBe(3000);
    expect(config.maxEntries).toBe(5000);
  });

  it("prefers options over the environment", () => {
    const config = resolveConfig(
      { baseUrl: "http://localhost:3000", cookieName: "x.session_token" },
      { ...env, SGAUTH_COOKIE_NAME: "ignored" },
    );
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.cookieName).toBe("x.session_token");
  });

  it("reads the cookie name from the environment", () => {
    const config = resolveConfig(
      {},
      { ...env, SGAUTH_COOKIE_NAME: "sgauth-local.session_token" },
    );
    expect(config.cookieName).toBe("sgauth-local.session_token");
  });

  it.each([
    ["__Secure-sgauth.session_token", "__Secure-sgauth.dont_remember"],
    ["__Secure-sgauth-dev.session_token", "__Secure-sgauth-dev.dont_remember"],
    ["sgauth-local.session_token", "sgauth-local.dont_remember"],
    ["custom", null],
  ])("derives the dont_remember name for %s", (cookieName, expected) => {
    expect(resolveConfig({ cookieName }, env).dontRememberCookieName).toBe(
      expected,
    );
  });

  it("caps the negative TTL at the cache TTL", () => {
    expect(resolveConfig({ cacheTtlSeconds: 5 }, env).negativeTtlSeconds).toBe(
      5,
    );
  });

  it("throws when the URL is missing or invalid", () => {
    expect(() => resolveConfig({}, {})).toThrow(SgauthConfigError);
    expect(() => resolveConfig({ baseUrl: "not a url" }, {})).toThrow(
      SgauthConfigError,
    );
    expect(() =>
      resolveConfig({ baseUrl: "ftp://auth.example.com" }, {}),
    ).toThrow(SgauthConfigError);
  });

  it("throws SgauthConfigError, not ReferenceError, where process is undefined", () => {
    vi.stubGlobal("process", undefined);
    try {
      expect(() => resolveConfig({})).toThrow(SgauthConfigError);
      expect(
        resolveConfig({ baseUrl: "https://auth.example.com" }).baseUrl,
      ).toBe("https://auth.example.com");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["cacheTtlSeconds", 0],
    ["cacheTtlSeconds", 301],
    ["cacheTtlSeconds", 1.5],
    ["staleIfErrorSeconds", -1],
    ["staleIfErrorSeconds", 901],
    ["timeoutMs", 0],
    ["timeoutMs", 10001],
    ["maxEntries", 0],
  ])("rejects %s = %s", (option, value) => {
    expect(() => resolveConfig({ [option]: value }, env)).toThrow(
      SgauthConfigError,
    );
  });

  it("accepts the boundary values", () => {
    expect(() =>
      resolveConfig(
        { cacheTtlSeconds: 300, staleIfErrorSeconds: 900, timeoutMs: 10000 },
        env,
      ),
    ).not.toThrow();
    expect(() => resolveConfig({ staleIfErrorSeconds: 0 }, env)).not.toThrow();
  });

  it("names the option but not its value in the message", () => {
    expect(() => resolveConfig({ cacheTtlSeconds: 4242 }, env)).toThrow(
      /cacheTtlSeconds/,
    );
    expect(() => resolveConfig({ cacheTtlSeconds: 4242 }, env)).not.toThrow(
      /4242/,
    );
  });
});
