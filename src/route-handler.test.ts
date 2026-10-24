import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccessTokenRouteHandler } from "./route-handler.js";
import {
  makeJwt,
  nowSeconds,
  statusResponse,
  tokenResponse,
} from "./test-helpers.js";
import type { SgauthAccessTokenOptions } from "./access-token.js";

const BASE = "https://auth.example.com";
const NAME = "__Secure-sgauth.session_token";

function setup(impl: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(impl);
  // One options object per test: the handler caches a fetcher per object.
  const options: SgauthAccessTokenOptions = { baseUrl: BASE, fetch: fetchMock };
  return { fetchMock, handler: createAccessTokenRouteHandler(options) };
}

const request = (cookie = `${NAME}=abc`) =>
  new Request("https://app.example.com/api/sgauth/token", {
    headers: { cookie },
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2029-12-15T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAccessTokenRouteHandler", () => {
  it("answers 200 with the token", async () => {
    const jwt = makeJwt(nowSeconds() + 600);
    const { handler } = setup(() => Promise.resolve(tokenResponse(jwt)));
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: jwt });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("answers 401 for an unauthenticated session", async () => {
    const { handler } = setup(() => Promise.resolve(statusResponse(401)));
    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ token: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 401 without calling SGAuth when there is no session cookie", async () => {
    const { handler, fetchMock } = setup(() =>
      Promise.resolve(statusResponse(500)),
    );
    const response = await handler(request("theme=dark"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when SGAuth is failing and nothing is cached", async () => {
    const { handler } = setup(() => Promise.resolve(statusResponse(500)));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "sgauth_unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("forwards only the SGAuth cookie upstream", async () => {
    const jwt = makeJwt(nowSeconds() + 600);
    const { handler, fetchMock } = setup(() =>
      Promise.resolve(tokenResponse(jwt)),
    );
    await handler(request(`theme=dark; ${NAME}=abc; analytics=xyz`));
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ cookie: `${NAME}=abc` });
  });

  it("adds no CORS headers", async () => {
    const { handler } = setup(() => Promise.resolve(statusResponse(401)));
    const response = await handler(request());
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
