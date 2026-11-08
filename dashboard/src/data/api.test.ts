import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiDataSource, FEED_TIMEOUT_MS, selectDataSource } from "@/data/api";
import { demoDataSource } from "@/data/demo";

vi.mock("server-only", () => ({}));

const TOKEN = "dash-secret-xyz";
const payload = {
  deals: [{ id: "1", pipeline: "developer", channel: "Website", createdAt: "2026-10-07T13:47:29Z", qualifiedAt: "2026-10-07T13:47:29Z", status: "open", sourceLabel: null, campaign: null, personId: null }],
  enquiries: [],
  spend: [],
  newsletter: { issues: [], subscribers: [] },
  search: { months: [], aiReferrals: [] },
  traffic: [],
  events: [],
  annotations: [],
  syncedAt: "2026-10-07T13:47:29Z",
  source: "pipedrive",
};

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("createApiDataSource", () => {
  it("reads the feed with the token in a header and never caches", async () => {
    const fetchMock = respond(200, payload);
    vi.stubGlobal("fetch", fetchMock);
    const data = await createApiDataSource({ url: "https://api.example.test/", token: TOKEN }).getDashboardData();
    expect(data.source).toBe("pipedrive");
    expect(data.deals[0].qualifiedAt).toBe("2026-10-07T13:47:29Z");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/dashboard");
    expect(init.cache).toBe("no-store");
    expect((init.headers as Record<string, string>)["x-dashboard-token"]).toBe(TOKEN);
    expect(url).not.toContain(TOKEN);
  });

  it("fails plainly on a refused or broken feed, without the token in the message", async () => {
    vi.stubGlobal("fetch", respond(401, { detail: "Not authenticated" }));
    const source = createApiDataSource({ url: "https://api.example.test", token: TOKEN });
    await expect(source.getDashboardData()).rejects.toThrow(/dashboard feed .*401/i);
    await expect(source.getDashboardData()).rejects.not.toThrow(new RegExp(TOKEN));
    vi.stubGlobal("fetch", respond(503, { detail: "No Pipedrive import yet: run scripts/import_pipedrive.py first" }));
    await expect(source.getDashboardData()).rejects.toThrow(/No Pipedrive import yet/);
  });

  it("gives up on a feed that does not answer in time, with a plain message", async () => {
    const fetchMock = respond(200, payload);
    vi.stubGlobal("fetch", fetchMock);
    await createApiDataSource({ url: "https://api.example.test", token: TOKEN }).getDashboardData();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(FEED_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }));
    await expect(createApiDataSource({ url: "https://api.example.test", token: TOKEN }).getDashboardData()).rejects.toThrow(/did not answer within/i);
  });

  it("refuses a payload that is not the dashboard shape", async () => {
    vi.stubGlobal("fetch", respond(200, { deals: "nope" }));
    await expect(createApiDataSource({ url: "https://api.example.test", token: TOKEN }).getDashboardData()).rejects.toThrow(/shape/i);
  });
});

describe("getDataSource", () => {
  it("reads the environment when asked, not when the module loaded", async () => {
    const { getDataSource } = await import("@/data");
    const before = { ...process.env };
    try {
      delete process.env.DASHBOARD_API_URL;
      delete process.env.DASHBOARD_API_TOKEN;
      expect(getDataSource()).toBe(demoDataSource);
      process.env.DASHBOARD_API_URL = "https://api.example.test";
      process.env.DASHBOARD_API_TOKEN = TOKEN;
      expect(getDataSource()).not.toBe(demoDataSource);
    } finally {
      process.env = before;
    }
  });
});

describe("selectDataSource", () => {
  it("uses demo data until both the feed URL and token are set", () => {
    expect(selectDataSource({})).toBe(demoDataSource);
    expect(selectDataSource({ DASHBOARD_API_URL: "https://api.example.test" })).toBe(demoDataSource);
    expect(selectDataSource({ DASHBOARD_API_URL: "https://api.example.test", DASHBOARD_API_TOKEN: TOKEN })).not.toBe(demoDataSource);
  });
});
