import { setImmediate as realTick } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSgauthClient, getSession } from "./client.js";
import { sha256Hex } from "./cache.js";
import { SgauthConfigError } from "./config.js";
import type { SgaSession, SgaSessionErrorInfo } from "./types.js";

const BASE = "https://auth.example.com";
const NAME = "__Secure-sgauth.session_token";
const START = new Date("2029-12-15T00:00:00.000Z");

function sessionBody(overrides: Partial<SgaSession["session"]> = {}) {
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
      ...overrides,
    },
  };
}

function ok(body: unknown = sessionBody()): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function status(code: number): Response {
  return new Response(null, { status: code });
}

const never = (): Promise<Response> => new Promise(() => undefined);

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

/**
 * Waits, on the real clock, until the client has reached `fetch`. Hashing the
 * token is asynchronous, so fake timers alone cannot tell when the request
 * (and therefore its timeout timer) exists.
 */
async function untilCalls(fetchMock: FetchMock, count: number): Promise<void> {
  while (fetchMock.mock.calls.length < count) await realTick();
}

function setup(
  options: Parameters<typeof createSgauthClient>[0] = {},
  impl: () => Promise<Response> = () => Promise.resolve(ok()),
) {
  const fetchMock: FetchMock = vi.fn<typeof fetch>(impl);
  const errors: SgaSessionErrorInfo[] = [];
  const client = createSgauthClient({
    baseUrl: BASE,
    fetch: fetchMock,
    onError: (info) => errors.push(info),
    ...options,
  });
  return { client, fetchMock, errors };
}

const cookie = (token = "tok") => ({ cookieHeader: `${NAME}=${token}` });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cache hit and miss", () => {
  it("fetches once for the same cookie and again for a different one", async () => {
    const { client, fetchMock } = setup();
    const first = await client.getSession(cookie("a"));
    expect(first?.user.email).toBe("a@example.com");
    await client.getSession(cookie("a"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.getSession(cookie("b"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null with no fetch when there is no session cookie", async () => {
    const { client, fetchMock } = setup();
    expect(await client.getSession({ cookieHeader: "theme=dark" })).toBeNull();
    expect(await client.getSession({ cookieHeader: null })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clearCache forces a refetch", async () => {
    const { client, fetchMock } = setup();
    await client.getSession(cookie());
    client.clearCache();
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used token", async () => {
    const { client, fetchMock } = setup({ maxEntries: 2 });
    await client.getSession(cookie("a"));
    await client.getSession(cookie("b"));
    await client.getSession(cookie("a"));
    await client.getSession(cookie("c"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await client.getSession(cookie("a"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await client.getSession(cookie("b"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("TTL", () => {
  it("is a hit at 59 s and a refetch past 60 s", async () => {
    const { client, fetchMock } = setup();
    await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(59_000);
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honours cacheTtlSeconds: 300", async () => {
    const { client, fetchMock } = setup({ cacheTtlSeconds: 300 });
    await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(299_000);
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects 0 and 301", () => {
    expect(() => setup({ cacheTtlSeconds: 0 })).toThrow(SgauthConfigError);
    expect(() => setup({ cacheTtlSeconds: 301 })).toThrow(SgauthConfigError);
  });
});

describe("401", () => {
  it("returns null without calling onError and caches for 10 s", async () => {
    const { client, fetchMock, errors } = setup({}, () =>
      Promise.resolve(status(401)),
    );
    expect(await client.getSession(cookie())).toBeNull();
    expect(errors).toEqual([]);
    await vi.advanceTimersByTimeAsync(9_000);
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    await client.getSession(cookie());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("replaces a cached 200", async () => {
    const { client, fetchMock } = setup();
    await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(61_000);
    fetchMock.mockResolvedValueOnce(status(401));
    expect(await client.getSession(cookie())).toBeNull();
    // Even a failing upstream must not resurrect the revoked session.
    fetchMock.mockResolvedValueOnce(status(503));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await client.getSession(cookie())).toBeNull();
  });
});

describe("timeout", () => {
  it("serves the stale session and reports it", async () => {
    const { client, fetchMock, errors } = setup();
    const primed = await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(61_000);
    fetchMock.mockImplementationOnce(never);
    const pending = client.getSession(cookie());
    await untilCalls(fetchMock, 2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toEqual(primed);
    expect(errors).toEqual([{ kind: "timeout", servedStale: true }]);
  });

  it("returns null with no cache and reports it", async () => {
    const { client, fetchMock, errors } = setup({}, never);
    const pending = client.getSession(cookie());
    await untilCalls(fetchMock, 1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toBeNull();
    expect(errors).toEqual([{ kind: "timeout", servedStale: false }]);
  });

  it("passes an abort signal that fires at the timeout", async () => {
    const { client, fetchMock } = setup({ timeoutMs: 500 }, never);
    const pending = client.getSession(cookie());
    await untilCalls(fetchMock, 1);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal?.aborted).toBe(true);
  });
});

describe("stale window", () => {
  it("returns null past ttl + staleIfErrorSeconds", async () => {
    const { client, fetchMock, errors } = setup();
    await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(361_000);
    fetchMock.mockResolvedValueOnce(status(503));
    expect(await client.getSession(cookie())).toBeNull();
    expect(errors).toEqual([{ kind: "http", status: 503, servedStale: false }]);
  });

  it("serves stale just inside the window", async () => {
    const { client, fetchMock } = setup();
    const primed = await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(359_000);
    fetchMock.mockResolvedValueOnce(status(503));
    expect(await client.getSession(cookie())).toEqual(primed);
  });

  it("returns null the moment the entry is stale when staleIfErrorSeconds is 0", async () => {
    const { client, fetchMock } = setup({ staleIfErrorSeconds: 0 });
    await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(60_000);
    fetchMock.mockResolvedValueOnce(status(503));
    expect(await client.getSession(cookie())).toBeNull();
  });

  it("does not serve a session past its own expiry", async () => {
    const { client, fetchMock, errors } = setup({}, () =>
      Promise.resolve(
        ok(sessionBody({ expiresAt: "2029-12-15T00:01:30.000Z" })),
      ),
    );
    await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(91_000);
    fetchMock.mockResolvedValueOnce(status(503));
    expect(await client.getSession(cookie())).toBeNull();
    expect(errors).toEqual([{ kind: "http", status: 503, servedStale: false }]);
  });
});

describe("unread bodies", () => {
  function streamed(code: number, onCancel: () => void): Response {
    const body = new ReadableStream<Uint8Array>({
      cancel: onCancel,
    });
    return new Response(body, { status: code });
  }

  it.each([401, 503])("cancels the body of a %s response", async (code) => {
    const onCancel = vi.fn();
    const { client } = setup({}, () =>
      Promise.resolve(streamed(code, onCancel)),
    );
    expect(await client.getSession(cookie())).toBeNull();
    await realTick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("is not broken by a body whose cancel rejects", async () => {
    const response = status(401);
    Object.defineProperty(response, "body", {
      value: { cancel: () => Promise.reject(new Error("boom")) },
    });
    const { client, errors } = setup({}, () => Promise.resolve(response));
    expect(await client.getSession(cookie())).toBeNull();
    expect(errors).toEqual([]);
  });
});

describe("upstream failures", () => {
  const cases: Array<[string, () => Promise<Response>, SgaSessionErrorInfo]> = [
    [
      "500",
      () => Promise.resolve(status(500)),
      { kind: "http", status: 500, servedStale: false },
    ],
    [
      "503",
      () => Promise.resolve(status(503)),
      { kind: "http", status: 503, servedStale: false },
    ],
    [
      "429",
      () => Promise.resolve(status(429)),
      { kind: "http", status: 429, servedStale: false },
    ],
    [
      "302",
      () => Promise.resolve(status(302)),
      { kind: "http", status: 302, servedStale: false },
    ],
    [
      "403",
      () => Promise.resolve(status(403)),
      { kind: "http", status: 403, servedStale: false },
    ],
    [
      "network throw",
      () => Promise.reject(new TypeError("fetch failed")),
      { kind: "network", servedStale: false },
    ],
    [
      "invalid body",
      () => Promise.resolve(ok({ nope: true })),
      { kind: "invalid-response", status: 200, servedStale: false },
    ],
    [
      "non-JSON body",
      () => Promise.resolve(new Response("<html>", { status: 200 })),
      { kind: "invalid-response", status: 200, servedStale: false },
    ],
  ];

  it.each(cases)(
    "%s reports, returns null and is not cached",
    async (_label, impl, expected) => {
      const { client, fetchMock, errors } = setup({}, impl);
      expect(await client.getSession(cookie())).toBeNull();
      expect(errors).toEqual([expected]);
      await client.getSession(cookie());
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("serves stale on a network throw", async () => {
    const { client, fetchMock, errors } = setup();
    const primed = await client.getSession(cookie());
    await vi.advanceTimersByTimeAsync(61_000);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await client.getSession(cookie())).toEqual(primed);
    expect(errors).toEqual([{ kind: "network", servedStale: true }]);
  });
});

describe("forwarding", () => {
  it("sends only the session cookies to the exact URL", async () => {
    const { client, fetchMock } = setup();
    await client.getSession({
      cookieHeader: `theme=dark; __Secure-sgauth.dont_remember=true; other=1; ${NAME}=tok`,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/api/sgauth/session`);
    expect(init?.headers).toEqual({
      cookie: `__Secure-sgauth.dont_remember=true; ${NAME}=tok`,
      accept: "application/json",
    });
    expect(init).toMatchObject({ cache: "no-store", redirect: "manual" });
  });

  it("accepts a Headers instance", async () => {
    const { client, fetchMock } = setup();
    await client.getSession({
      headers: new Headers({ cookie: `${NAME}=tok` }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws TypeError for a bad input shape", async () => {
    const { client } = setup();
    await expect(client.getSession({} as never)).rejects.toThrow(TypeError);
  });
});

describe("dedupe", () => {
  const slow = (response: () => Response) => (): Promise<Response> =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(response());
      }, 100);
    });

  it("shares one fetch between concurrent calls", async () => {
    const { client, fetchMock } = setup({}, slow(ok));
    const all = Promise.all(
      Array.from({ length: 5 }, () => client.getSession(cookie())),
    );
    await untilCalls(fetchMock, 1);
    await vi.advanceTimersByTimeAsync(100);
    const results = await all;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => r?.user.id)).size).toBe(1);
  });

  it("reports a shared failure once", async () => {
    const { client, fetchMock, errors } = setup(
      {},
      slow(() => status(503)),
    );
    const all = Promise.all(
      Array.from({ length: 5 }, () => client.getSession(cookie())),
    );
    await untilCalls(fetchMock, 1);
    await vi.advanceTimersByTimeAsync(100);
    await all;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
  });
});

describe("onError safety", () => {
  it("does not reject when onError throws", async () => {
    const { client } = setup(
      {
        onError: () => {
          throw new Error("boom");
        },
      },
      () => Promise.resolve(status(503)),
    );
    expect(await client.getSession(cookie())).toBeNull();
  });

  it("never carries the token or its hash", async () => {
    const token = "super-secret-token";
    const { client, errors } = setup({}, () => Promise.resolve(status(503)));
    await client.getSession(cookie(token));
    const serialized = JSON.stringify(errors);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(await sha256Hex(token));
    expect(serialized).not.toContain(NAME);
  });
});

describe("default getSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws SgauthConfigError when SGAUTH_URL is unset", async () => {
    vi.stubEnv("SGAUTH_URL", "");
    await expect(getSession(cookie())).rejects.toThrow(SgauthConfigError);
  });
});
