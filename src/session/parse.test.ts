import { describe, expect, it } from "vitest";
import { parseSession } from "./parse.js";

function body(): Record<string, unknown> {
  return {
    user: {
      id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      email: "a@example.com",
      name: "Ada",
      preferredName: null,
      isAdmin: false,
      isPrimaryAdmin: false,
    },
    positions: [{ key: "president", name: "President" }],
    session: {
      id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      expiresAt: "2030-01-01T00:00:00.000Z",
      absoluteExpiresAt: "2030-02-01T00:00:00.000Z",
      createdAt: "2029-12-01T00:00:00.000Z",
    },
  };
}

describe("parseSession", () => {
  it("accepts a valid body", () => {
    expect(parseSession(body())).toEqual(body());
  });

  it("accepts a string preferredName", () => {
    const input = body();
    (input["user"] as Record<string, unknown>)["preferredName"] = "Ads";
    expect(parseSession(input)?.user.preferredName).toBe("Ads");
  });

  it("drops unknown keys at every level", () => {
    const input = body();
    input["extra"] = 1;
    (input["user"] as Record<string, unknown>)["extra"] = 1;
    const [position] = input["positions"] as Record<string, unknown>[];
    (position as Record<string, unknown>)["extra"] = 1;
    (input["session"] as Record<string, unknown>)["extra"] = 1;
    expect(parseSession(input)).toEqual(body());
  });

  it("returns null for a missing or mistyped field", () => {
    const cases: Array<(b: Record<string, unknown>) => void> = [
      (b) => delete b["user"],
      (b) => delete b["positions"],
      (b) => delete b["session"],
      (b) => (b["positions"] = {}),
      (b) => delete (b["user"] as Record<string, unknown>)["email"],
      (b) => ((b["user"] as Record<string, unknown>)["isAdmin"] = "yes"),
      (b) => ((b["user"] as Record<string, unknown>)["preferredName"] = 3),
      (b) => delete (b["user"] as Record<string, unknown>)["preferredName"],
      (b) => ((b["positions"] as unknown[])[0] = { key: "x" }),
      (b) => ((b["session"] as Record<string, unknown>)["expiresAt"] = 5),
      (b) => delete (b["session"] as Record<string, unknown>)["id"],
    ];
    for (const mutate of cases) {
      const input = body();
      mutate(input);
      expect(parseSession(input)).toBeNull();
    }
  });

  it("returns null for non-objects", () => {
    for (const bad of [null, undefined, "x", 1, [], true]) {
      expect(parseSession(bad)).toBeNull();
    }
  });
});
