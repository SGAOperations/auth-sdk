import { describe, expect, it } from "vitest";
import { decodeJwtExp } from "./jwt-exp.js";

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function jwt(payload: unknown): string {
  return `${base64url('{"alg":"ES256"}')}.${base64url(JSON.stringify(payload))}.sig`;
}

describe("decodeJwtExp", () => {
  it("reads exp from a valid token", () => {
    expect(decodeJwtExp(jwt({ exp: 1893456000 }))).toBe(1893456000);
  });

  it("decodes a payload that uses the URL-safe alphabet", () => {
    // "???>>>" encodes to "Pz8_Pj4-" in base64url, which has both - and _.
    const payload = { exp: 42, note: "???>>>" };
    const token = jwt(payload);
    expect(token.split(".")[1]).toMatch(/[-_]/);
    expect(decodeJwtExp(token)).toBe(42);
  });

  it("decodes a multi-byte payload", () => {
    expect(decodeJwtExp(jwt({ exp: 7, name: "Zoë 日本" }))).toBe(7);
  });

  it("returns null for the wrong number of segments", () => {
    expect(decodeJwtExp("a.b")).toBeNull();
    expect(decodeJwtExp("a.b.c.d")).toBeNull();
    expect(decodeJwtExp("")).toBeNull();
  });

  it("returns null when the payload is not valid base64 or JSON", () => {
    expect(decodeJwtExp("a.!!!.c")).toBeNull();
    expect(decodeJwtExp(`a.${base64url("not json")}.c`)).toBeNull();
    expect(decodeJwtExp(`a.${base64url("null")}.c`)).toBeNull();
    expect(decodeJwtExp(`a..c`)).toBeNull();
  });

  it("returns null when exp is missing or not a finite number", () => {
    expect(decodeJwtExp(jwt({}))).toBeNull();
    expect(decodeJwtExp(jwt({ exp: "1893456000" }))).toBeNull();
    expect(decodeJwtExp(jwt({ exp: null }))).toBeNull();
  });
});
