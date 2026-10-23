import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCache, sha256Hex } from "./cache.js";
import type { SgaSession } from "./types.js";

function session(overrides: Partial<SgaSession["session"]> = {}): SgaSession {
  return {
    user: {
      id: "u",
      email: "a@example.com",
      name: "Ada",
      preferredName: null,
      isAdmin: false,
      isPrimaryAdmin: false,
    },
    positions: [],
    session: {
      id: "s",
      expiresAt: "2030-01-01T00:00:00.000Z",
      absoluteExpiresAt: "2030-02-01T00:00:00.000Z",
      createdAt: "2029-12-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2029-12-15T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sha256Hex", () => {
  it("matches the known digest", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("SessionCache", () => {
  it("is fresh, then stale, then a miss", () => {
    const cache = new SessionCache(10);
    const value = session();
    cache.setSession("k", value, 60, 300);
    expect(cache.get("k")).toEqual({ state: "fresh", value });
    vi.advanceTimersByTime(60_000);
    expect(cache.get("k")).toEqual({ state: "stale", value });
    vi.advanceTimersByTime(299_000);
    expect(cache.get("k").state).toBe("stale");
    vi.advanceTimersByTime(1_000);
    expect(cache.get("k")).toEqual({ state: "miss" });
  });

  it("has no stale window when staleSeconds is 0", () => {
    const cache = new SessionCache(10);
    cache.setSession("k", session(), 60, 0);
    vi.advanceTimersByTime(60_000);
    expect(cache.get("k")).toEqual({ state: "miss" });
  });

  it("never serves a negative entry stale", () => {
    const cache = new SessionCache(10);
    cache.setNegative("k", 10);
    expect(cache.get("k")).toEqual({ state: "fresh", value: null });
    vi.advanceTimersByTime(10_000);
    expect(cache.get("k")).toEqual({ state: "miss" });
  });

  it("drops a session past expiresAt, fresh or stale", () => {
    const cache = new SessionCache(10);
    cache.setSession(
      "k",
      session({ expiresAt: "2029-12-15T00:00:30.000Z" }),
      60,
      300,
    );
    vi.advanceTimersByTime(30_000);
    expect(cache.get("k")).toEqual({ state: "miss" });
  });

  it("drops a session past absoluteExpiresAt", () => {
    const cache = new SessionCache(10);
    cache.setSession(
      "k",
      session({ absoluteExpiresAt: "2029-12-15T00:00:30.000Z" }),
      60,
      300,
    );
    vi.advanceTimersByTime(30_000);
    expect(cache.get("k")).toEqual({ state: "miss" });
  });

  it("treats an unparseable expiry as expired", () => {
    const cache = new SessionCache(10);
    cache.setSession("k", session({ expiresAt: "garbage" }), 60, 300);
    expect(cache.get("k")).toEqual({ state: "miss" });
  });

  it("evicts the least recently used entry", () => {
    const cache = new SessionCache(2);
    cache.setSession("a", session(), 60, 0);
    cache.setSession("b", session(), 60, 0);
    cache.get("a");
    cache.setSession("c", session(), 60, 0);
    expect(cache.get("b")).toEqual({ state: "miss" });
    expect(cache.get("a").state).toBe("fresh");
    expect(cache.get("c").state).toBe("fresh");
    expect(cache.size).toBe(2);
  });

  it("clears", () => {
    const cache = new SessionCache(2);
    cache.setSession("a", session(), 60, 0);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
