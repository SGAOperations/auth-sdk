import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SgaSession } from "./session/types.js";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn(),
  getSession: vi.fn(),
  cache: vi.fn(),
  scopeResets: [] as (() => void)[],
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./session/client.js", () => ({ getSession: mocks.getSession }));
// Outside a React render there is no cache scope, so model one: memoise until
// the test starts a new scope.
vi.mock("react", () => ({
  cache: mocks.cache.mockImplementation(
    <T>(fn: () => Promise<T>): (() => Promise<T>) => {
      let memo: Promise<T> | undefined;
      mocks.scopeResets.push(() => {
        memo = undefined;
      });
      return () => (memo ??= fn());
    },
  ),
}));

const { getServerSession, requireSession } = await import("./next.js");

const SESSION = { user: { id: "u1" } } as unknown as SgaSession;

function stubHeaders(values: Record<string, string>): Headers {
  const requestHeaders = new Headers(values);
  mocks.headers.mockResolvedValue(requestHeaders);
  return requestHeaders;
}

function redirectTarget(): string {
  const call = mocks.redirect.mock.calls[0] as [string] | undefined;
  if (call === undefined) throw new Error("redirect was not called");
  return call[0];
}

beforeEach(() => {
  vi.stubEnv("SGAUTH_URL", "https://auth.example.com");
  for (const reset of mocks.scopeResets) reset();
  mocks.getSession.mockReset();
  mocks.redirect.mockReset();
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getServerSession", () => {
  it("is wrapped in cache, so one scope makes one lookup", async () => {
    expect(mocks.cache).toHaveBeenCalledTimes(1);
    const requestHeaders = stubHeaders({ cookie: "a=b" });
    mocks.getSession.mockResolvedValue(SESSION);
    expect(await getServerSession()).toBe(SESSION);
    expect(await getServerSession()).toBe(SESSION);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
  });
});

describe("requireSession", () => {
  it("returns the session when there is one", async () => {
    stubHeaders({});
    mocks.getSession.mockResolvedValue(SESSION);
    expect(await requireSession()).toBe(SESSION);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to login with the URL the proxy recorded", async () => {
    stubHeaders({
      "x-sgauth-return-to": "https://app.example.com/protected?a=1",
      host: "internal:3000",
    });
    mocks.getSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow(/^REDIRECT /);
    expect(redirectTarget()).toBe(
      "https://auth.example.com/login?redirect=https%3A%2F%2Fapp.example.com%2Fprotected%3Fa%3D1",
    );
  });

  it("prefers an explicit returnTo", async () => {
    stubHeaders({ "x-sgauth-return-to": "https://app.example.com/header" });
    mocks.getSession.mockResolvedValue(null);
    await expect(
      requireSession({ returnTo: "https://app.example.com/explicit" }),
    ).rejects.toThrow(/^REDIRECT /);
    expect(redirectTarget()).toBe(
      "https://auth.example.com/login?redirect=https%3A%2F%2Fapp.example.com%2Fexplicit",
    );
  });

  it("falls back to the host header", async () => {
    stubHeaders({
      host: "app.example.com",
      "x-forwarded-proto": "http, https",
    });
    mocks.getSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow(/^REDIRECT /);
    expect(redirectTarget()).toBe(
      "https://auth.example.com/login?redirect=http%3A%2F%2Fapp.example.com%2F",
    );
  });

  it("defaults the fallback scheme to https and omits redirect with no host", async () => {
    mocks.getSession.mockResolvedValue(null);
    stubHeaders({ host: "app.example.com" });
    await expect(requireSession()).rejects.toThrow(/^REDIRECT /);
    expect(redirectTarget()).toBe(
      "https://auth.example.com/login?redirect=https%3A%2F%2Fapp.example.com%2F",
    );

    mocks.redirect.mockClear();
    stubHeaders({});
    await expect(requireSession()).rejects.toThrow(/^REDIRECT /);
    expect(redirectTarget()).toBe("https://auth.example.com/login");
  });
});
