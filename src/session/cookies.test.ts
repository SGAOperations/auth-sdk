import { describe, expect, it } from "vitest";
import { readCookieHeader, selectSessionCookies } from "./cookies.js";

const names = {
  cookieName: "__Secure-sgauth.session_token",
  dontRememberCookieName: "__Secure-sgauth.dont_remember",
};

describe("readCookieHeader", () => {
  it("reads from a Headers instance", () => {
    const headers = new Headers({ cookie: "a=1" });
    expect(readCookieHeader({ headers })).toBe("a=1");
  });

  it("reads from a plain record, joining array values", () => {
    expect(readCookieHeader({ headers: { cookie: "a=1" } })).toBe("a=1");
    expect(readCookieHeader({ headers: { cookie: ["a=1", "b=2"] } })).toBe(
      "a=1; b=2",
    );
    expect(readCookieHeader({ headers: {} })).toBeNull();
  });

  it("reads cookieHeader", () => {
    expect(readCookieHeader({ cookieHeader: "a=1" })).toBe("a=1");
    expect(readCookieHeader({ cookieHeader: null })).toBeNull();
    expect(readCookieHeader({ cookieHeader: undefined })).toBeNull();
  });

  it("throws TypeError for any other shape", () => {
    for (const bad of [null, undefined, "a=1", 5, {}, { headers: null }]) {
      expect(() => readCookieHeader(bad as never)).toThrow(TypeError);
    }
    expect(() => readCookieHeader({ cookieHeader: 5 } as never)).toThrow(
      TypeError,
    );
  });
});

describe("selectSessionCookies", () => {
  it("keeps only the session cookies, in their original order", () => {
    const result = selectSessionCookies(
      "theme=dark; __Secure-sgauth.dont_remember=true; other=1; __Secure-sgauth.session_token=tok.sig",
      names,
    );
    expect(result.token).toBe("tok.sig");
    expect(result.forward).toBe(
      "__Secure-sgauth.dont_remember=true; __Secure-sgauth.session_token=tok.sig",
    );
  });

  it("does not match names that merely contain a session name", () => {
    const result = selectSessionCookies(
      "x__Secure-sgauth.session_token=evil; __Secure-sgauth.session_token=good",
      names,
    );
    expect(result.token).toBe("good");
    expect(result.forward).toBe("__Secure-sgauth.session_token=good");
  });

  it("keeps the first token when the cookie is duplicated", () => {
    const result = selectSessionCookies(
      "__Secure-sgauth.session_token=first; __Secure-sgauth.session_token=second",
      names,
    );
    expect(result.token).toBe("first");
  });

  it("never decodes values", () => {
    const result = selectSessionCookies(
      "__Secure-sgauth.session_token=a%2Fb%3D",
      names,
    );
    expect(result.token).toBe("a%2Fb%3D");
  });

  it("returns no token without a session cookie", () => {
    expect(selectSessionCookies(null, names)).toEqual({
      token: null,
      forward: "",
    });
    expect(selectSessionCookies("a=1", names).token).toBeNull();
    expect(
      selectSessionCookies("__Secure-sgauth.dont_remember=true", names),
    ).toEqual({ token: null, forward: "" });
    expect(
      selectSessionCookies("__Secure-sgauth.session_token=", names).token,
    ).toBeNull();
  });
});
