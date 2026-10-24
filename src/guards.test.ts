import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasAllPositions,
  hasAnyPosition,
  hasPosition,
  isAdmin,
} from "./guards.js";
import type { SgaSession } from "./session/types.js";

function session(
  keys: string[],
  user: Partial<SgaSession["user"]> = {},
): SgaSession {
  return {
    user: {
      id: "u1",
      email: "a@example.com",
      name: "A",
      preferredName: null,
      isAdmin: false,
      isPrimaryAdmin: false,
      ...user,
    },
    positions: keys.map((key) => ({ key, name: key })),
    session: {
      id: "s1",
      expiresAt: "2030-01-01T00:00:00.000Z",
      absoluteExpiresAt: "2030-01-01T00:00:00.000Z",
      createdAt: "2029-01-01T00:00:00.000Z",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("position guards", () => {
  it("deny a missing session", () => {
    for (const none of [null, undefined]) {
      expect(hasPosition(none, "a")).toBe(false);
      expect(hasAnyPosition(none, ["a"])).toBe(false);
      expect(hasAllPositions(none, ["a"])).toBe(false);
      expect(isAdmin(none)).toBe(false);
    }
  });

  it("deny a session with no positions", () => {
    const s = session([]);
    expect(hasPosition(s, "a")).toBe(false);
    expect(hasAnyPosition(s, ["a"])).toBe(false);
    expect(hasAllPositions(s, ["a"])).toBe(false);
  });

  it("match held positions", () => {
    const s = session(["a", "b"]);
    expect(hasPosition(s, "a")).toBe(true);
    expect(hasPosition(s, "c")).toBe(false);
    expect(hasAnyPosition(s, ["c", "b"])).toBe(true);
    expect(hasAnyPosition(s, ["c", "d"])).toBe(false);
    expect(hasAllPositions(s, ["a", "b"])).toBe(true);
    expect(hasAllPositions(s, ["a", "c"])).toBe(false);
  });

  it("fail closed on empty keys", () => {
    const s = session(["a"]);
    expect(hasAnyPosition(s, [])).toBe(false);
    expect(hasAllPositions(s, [])).toBe(false);
  });
});

describe("isAdmin", () => {
  it("accepts an admin or the primary admin only", () => {
    expect(isAdmin(session([]))).toBe(false);
    expect(isAdmin(session([], { isAdmin: true }))).toBe(true);
    expect(isAdmin(session([], { isPrimaryAdmin: true }))).toBe(true);
  });
});

describe("server-only assertion", () => {
  it("throws when a window exists", () => {
    vi.stubGlobal("window", {});
    expect(() => hasPosition(null, "a")).toThrow(
      "@nusgaops/sgauth: hasPosition() is server-only",
    );
    expect(() => hasAnyPosition(null, ["a"])).toThrow(/server-only/);
    expect(() => hasAllPositions(null, ["a"])).toThrow(/server-only/);
    expect(() => isAdmin(null)).toThrow(/server-only/);
  });
});
