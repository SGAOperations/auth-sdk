import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAccessTokenFetcher,
  createSupabaseAccessTokenProvider,
  getAccessToken,
  type SgauthAccessTokenOptions,
} from "./access-token.js";
import { SgauthConfigError } from "./session/config.js";
import type { GetSessionInput } from "./session/types.js";
import {
  makeJwt,
  never,
  nowSeconds,
  statusResponse,
  tokenResponse,
  untilCalls,
  type FetchMock,
} from "./test-helpers.js";
import type { SgaAccessTokenErrorInfo } from "./token-core.js";

const BASE = "https://auth.example.com";
const NAME = "__Secure-sgauth.session_token";
const START = new Date("2029-12-15T00:00:00.000Z");

const cookie = (token = "tok") => ({ cookieHeader: `${NAME}=${token}` });

function setup(
  impl: () => Promise<Response>,
  options: SgauthAccessTokenOptions = {},
) {
  const fetchMock: FetchMock = vi.fn<typeof fetch>(impl);
  const errors: SgaAccessTokenErrorInfo[] = [];
  const fetcher = createAccessTokenFetcher({
    baseUrl: BASE,
    fetch: fetchMock,
    onError: (info) => errors.push(info),
    ...options,
  });
  const get = async (input: GetSessionInput = cookie()) => {
    const outcome = await fetcher.fetchAccessToken(input);
    return outcome.status === "ok" ? outcome.token : null;
  };
  return { fetcher, fetchMock, errors, get };
}

/** A mock that mints a token expiring `lifetime` seconds after each call. */
function minting(lifetime = 600) {
  let n = 0;
  return () => {
    n += 1;
    return Promise.resolve(
      tokenResponse(makeJwt(nowSeconds() + lifetime, `t${String(n)}`)),
    );
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refresh and revocation", () => {
  it("refreshes before expiry, and a revoked session stops yielding tokens", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { fetchMock, get } = setup(() => respond());

    const a = await get();
    expect(a).not.toBeNull();
    vi.advanceTimersByTime(539_000);
    expect(await get()).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past exp - 60 s, but well before the token itself expires at 600 s.
    vi.advanceTimersByTime(2_000);
    const b = await get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);

    respond = () => Promise.resolve(statusResponse(401));
    expect(await get()).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(540_000);
    expect(await get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The revoked token is gone, and there is no negative cache.
    expect(await get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("treats 403 like 401", async () => {
    const { get } = setup(() => Promise.resolve(statusResponse(403)));
    expect(await get()).toBeNull();
  });

  it("honours refreshSkewSeconds", async () => {
    const { fetchMock, get } = setup(minting(600), { refreshSkewSeconds: 10 });
    await get();
    vi.advanceTimersByTime(580_000);
    await get();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(11_000);
    await get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clamps refreshSkewSeconds to 300", async () => {
    const { fetchMock, get } = setup(minting(600), {
      refreshSkewSeconds: 9999,
    });
    await get();
    vi.advanceTimersByTime(299_000);
    await get();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a token that is already inside its refresh window without caching it", async () => {
    const { fetchMock, get } = setup(minting(30));
    expect(await get()).not.toBeNull();
    expect(await get()).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("request shape", () => {
  it("makes no request without a cookie", async () => {
    const { fetchMock, get } = setup(minting());
    expect(await get({ cookieHeader: undefined })).toBeNull();
    expect(await get({ cookieHeader: "other=1" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the SGAuth cookie to the token endpoint", async () => {
    const { fetchMock, get } = setup(minting());
    await get({
      cookieHeader: `theme=dark; ${NAME}=abc; analytics=xyz`,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/api/auth/token`);
    expect(init?.headers).toEqual({
      cookie: `${NAME}=abc`,
      accept: "application/json",
    });
    expect(init?.method).toBe("GET");
    expect((init as { cache?: string }).cache).toBe("no-store");
  });

  it("caches different cookies separately", async () => {
    const { fetchMock, get } = setup(minting());
    const one = await get(cookie("one"));
    const two = await get(cookie("two"));
    expect(one).not.toBe(two);
    expect(await get(cookie("one"))).toBe(one);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers", async () => {
    const { fetchMock, get } = setup(minting());
    const results = await Promise.all([get(), get(), get()]);
    expect(new Set(results).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used token past maxEntries", async () => {
    const { fetchMock, get } = setup(minting(), { maxEntries: 1 });
    await get(cookie("one"));
    await get(cookie("two"));
    await get(cookie("one"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("accepts a Headers instance", async () => {
    const { get } = setup(minting());
    const headers = new Headers({ cookie: `${NAME}=abc` });
    expect(await get({ headers })).not.toBeNull();
  });
});

describe("failures", () => {
  it("serves a cached token on a 500 inside the window and reports it", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { get, errors } = setup(() => respond());
    const a = await get();
    vi.advanceTimersByTime(545_000);
    respond = () => Promise.resolve(statusResponse(500));
    expect(await get()).toBe(a);
    expect(errors).toEqual([{ kind: "http", status: 500, servedStale: true }]);
  });

  it("does not cache the failure: the next call retries", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { fetchMock, get } = setup(() => respond());
    await get();
    vi.advanceTimersByTime(545_000);
    respond = () => Promise.resolve(statusResponse(503));
    await get();
    respond = minting(600);
    const fresh = await get();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fresh).not.toBeNull();
  });

  it("returns null on a 500 with nothing cached", async () => {
    const { get, errors } = setup(() => Promise.resolve(statusResponse(500)));
    expect(await get()).toBeNull();
    expect(errors).toEqual([{ kind: "http", status: 500, servedStale: false }]);
  });

  it("returns null on a 429 with nothing cached", async () => {
    const { get, errors } = setup(() => Promise.resolve(statusResponse(429)));
    expect(await get()).toBeNull();
    expect(errors[0]).toMatchObject({ kind: "http", status: 429 });
  });

  it("never serves a cached token within 10 seconds of its expiry", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { get, errors } = setup(() => respond());
    await get();
    vi.advanceTimersByTime(591_000);
    respond = () => Promise.resolve(statusResponse(500));
    expect(await get()).toBeNull();
    expect(errors).toEqual([{ kind: "http", status: 500, servedStale: false }]);
  });

  it("never serves a cached token past its expiry", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { get } = setup(() => respond());
    await get();
    vi.advanceTimersByTime(601_000);
    respond = () => Promise.resolve(statusResponse(500));
    expect(await get()).toBeNull();
  });

  it("treats a network error as a failure", async () => {
    const { get, errors } = setup(() => Promise.reject(new TypeError("boom")));
    expect(await get()).toBeNull();
    expect(errors).toEqual([{ kind: "network", servedStale: false }]);
  });

  it("treats a timeout as a failure", async () => {
    const { fetchMock, get, errors } = setup(never, { timeoutMs: 1000 });
    const pending = get();
    await untilCalls(fetchMock, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    expect(errors).toEqual([{ kind: "timeout", servedStale: false }]);
  });

  it.each([
    ["a non-JSON body", () => new Response("nope", { status: 200 })],
    [
      "a body without a token",
      () => new Response(JSON.stringify({}), { status: 200 }),
    ],
    ["a token without an exp", () => tokenResponse("a.b.c")],
  ])("treats %s as invalid", async (_label, make) => {
    const { get, errors } = setup(() => Promise.resolve(make()));
    expect(await get()).toBeNull();
    expect(errors).toEqual([
      { kind: "invalid-response", status: 200, servedStale: false },
    ]);
  });

  it("ignores an onError that throws", async () => {
    const { get } = setup(() => Promise.resolve(statusResponse(500)), {
      onError: () => {
        throw new Error("logger down");
      },
    });
    expect(await get()).toBeNull();
  });

  it("never puts the cookie or token in an error report", async () => {
    const { get, errors } = setup(() => Promise.resolve(statusResponse(500)));
    await get(cookie("super-secret"));
    expect(JSON.stringify(errors)).not.toContain("super-secret");
  });
});

describe("convenience functions", () => {
  it("getAccessToken uses the given options and caches per options object", async () => {
    const fetchMock = vi.fn<typeof fetch>(minting());
    const options: SgauthAccessTokenOptions = {
      baseUrl: BASE,
      fetch: fetchMock,
    };
    const first = await getAccessToken(cookie(), options);
    expect(await getAccessToken(cookie(), options)).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createSupabaseAccessTokenProvider returns a callback bound to the request", async () => {
    const fetchMock = vi.fn<typeof fetch>(minting());
    const provider = createSupabaseAccessTokenProvider(cookie(), {
      baseUrl: BASE,
      fetch: fetchMock,
    });
    const token = await provider();
    expect(typeof token).toBe("string");
    expect(provider).toBeTypeOf("function");
  });

  it("getAccessToken returns null without a session cookie", async () => {
    const fetchMock = vi.fn<typeof fetch>(minting());
    expect(
      await getAccessToken(
        { cookieHeader: null },
        { baseUrl: BASE, fetch: fetchMock },
      ),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws SgauthConfigError when misconfigured", () => {
    expect(() => createAccessTokenFetcher({ baseUrl: "nope" })).toThrow(
      SgauthConfigError,
    );
  });
});
