import { afterEach, describe, expect, it, vi } from "vitest";
import { SgauthConfigError } from "./session/config.js";
import { accountUrl, loginUrl, logoutUrl } from "./urls.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("URL builders", () => {
  it("encodes the redirect parameter", () => {
    vi.stubEnv("SGAUTH_URL", "https://auth.example.com");
    expect(loginUrl("https://app.example.com/a?b=1&c=2")).toBe(
      "https://auth.example.com/login?redirect=https%3A%2F%2Fapp.example.com%2Fa%3Fb%3D1%26c%3D2",
    );
    expect(logoutUrl("https://app.example.com/")).toBe(
      "https://auth.example.com/logout?redirect=https%3A%2F%2Fapp.example.com%2F",
    );
  });

  it("omits the redirect parameter when none is given", () => {
    vi.stubEnv("SGAUTH_URL", "https://auth.example.com");
    expect(loginUrl()).toBe("https://auth.example.com/login");
    expect(logoutUrl()).toBe("https://auth.example.com/logout");
    expect(accountUrl()).toBe("https://auth.example.com/account");
  });

  it("prefers the option, then NEXT_PUBLIC_SGAUTH_URL, then SGAUTH_URL", () => {
    vi.stubEnv("SGAUTH_URL", "https://server.example.com");
    expect(accountUrl()).toBe("https://server.example.com/account");
    vi.stubEnv("NEXT_PUBLIC_SGAUTH_URL", "https://public.example.com");
    expect(accountUrl()).toBe("https://public.example.com/account");
    expect(accountUrl({ baseUrl: "https://option.example.com" })).toBe(
      "https://option.example.com/account",
    );
  });

  it("tolerates a trailing slash on the base", () => {
    expect(loginUrl(undefined, { baseUrl: "https://auth.example.com//" })).toBe(
      "https://auth.example.com/login",
    );
  });

  it("throws when no base is configured", () => {
    vi.stubEnv("SGAUTH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SGAUTH_URL", "");
    expect(() => loginUrl()).toThrow(SgauthConfigError);
    expect(() => loginUrl()).toThrow(/SGAUTH_URL/);
  });
});
