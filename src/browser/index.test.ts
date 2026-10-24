import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeJwt,
  never,
  nowSeconds,
  statusResponse,
  tokenResponse,
  untilCalls,
  type FetchMock,
} from "../test-helpers.js";
import {
  createBrowserSupabaseAccessTokenProvider,
  type BrowserAccessTokenOptions,
} from "./index.js";
import type { SgaAccessTokenErrorInfo } from "../token-core.js";

function minting(lifetime = 600) {
  let n = 0;
  return () => {
    n += 1;
    return Promise.resolve(
      tokenResponse(makeJwt(nowSeconds() + lifetime, `t${String(n)}`)),
    );
  };
}

function setup(
  impl: () => Promise<Response>,
  options: BrowserAccessTokenOptions = {},
) {
  const fetchMock: FetchMock = vi.fn<typeof fetch>(impl);
  const errors: SgaAccessTokenErrorInfo[] = [];
  const provider = createBrowserSupabaseAccessTokenProvider({
    fetch: fetchMock,
    onError: (info) => errors.push(info),
    ...options,
  });
  return { provider, fetchMock, errors };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2029-12-15T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createBrowserSupabaseAccessTokenProvider", () => {
  it("requests the default endpoint with same-origin credentials", async () => {
    const { provider, fetchMock } = setup(minting());
    await provider();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/sgauth/token");
    expect(init?.credentials).toBe("same-origin");
    expect((init as { cache?: string }).cache).toBe("no-store");
  });

  it("uses a custom endpoint", async () => {
    const { provider, fetchMock } = setup(minting(), {
      endpoint: "/api/custom/token",
    });
    await provider();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/custom/token");
  });

  it("refreshes before expiry, and a signed-out user gets null", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { provider, fetchMock } = setup(() => respond());

    const a = await provider();
    expect(a).not.toBeNull();
    vi.advanceTimersByTime(539_000);
    expect(await provider()).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    const b = await provider();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);

    respond = () => Promise.resolve(statusResponse(401));
    vi.advanceTimersByTime(540_000);
    expect(await provider()).toBeNull();
    expect(await provider()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shares one request between concurrent callers", async () => {
    const { provider, fetchMock } = setup(minting());
    const results = await Promise.all([provider(), provider(), provider()]);
    expect(new Set(results).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the cached token on an error inside the window and reports it", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { provider, errors } = setup(() => respond());
    const a = await provider();
    vi.advanceTimersByTime(545_000);
    respond = () => Promise.resolve(statusResponse(503));
    expect(await provider()).toBe(a);
    expect(errors).toEqual([{ kind: "http", status: 503, servedStale: true }]);
  });

  it("returns null on an error with nothing usable cached", async () => {
    const { provider, errors } = setup(() =>
      Promise.resolve(statusResponse(503)),
    );
    expect(await provider()).toBeNull();
    expect(errors).toEqual([{ kind: "http", status: 503, servedStale: false }]);
  });

  it("never serves a cached token within 10 seconds of its expiry", async () => {
    let respond: () => Promise<Response> = minting(600);
    const { provider } = setup(() => respond());
    await provider();
    vi.advanceTimersByTime(591_000);
    respond = () => Promise.resolve(statusResponse(503));
    expect(await provider()).toBeNull();
  });

  it("treats a network error as a failure", async () => {
    const { provider, errors } = setup(() =>
      Promise.reject(new TypeError("offline")),
    );
    expect(await provider()).toBeNull();
    expect(errors).toEqual([{ kind: "network", servedStale: false }]);
  });

  it("treats a timeout as a failure", async () => {
    const { provider, fetchMock, errors } = setup(never, { timeoutMs: 500 });
    const pending = provider();
    await untilCalls(fetchMock, 1);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBeNull();
    expect(errors).toEqual([{ kind: "timeout", servedStale: false }]);
  });

  it("treats a malformed token as invalid", async () => {
    const { provider, errors } = setup(() =>
      Promise.resolve(tokenResponse("not-a-jwt")),
    );
    expect(await provider()).toBeNull();
    expect(errors).toEqual([
      { kind: "invalid-response", status: 200, servedStale: false },
    ]);
  });

  it("falls back to globalThis.fetch", async () => {
    const globalFetch = vi.fn<typeof fetch>(minting());
    vi.stubGlobal("fetch", globalFetch);
    try {
      const provider = createBrowserSupabaseAccessTokenProvider();
      expect(await provider()).not.toBeNull();
      expect(globalFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
