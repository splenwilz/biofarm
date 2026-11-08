import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/healthz/route";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("GET /healthz", () => {
  it("answers 200 with a small JSON body and no caching, without touching the feed", async () => {
    delete process.env.DASHBOARD_API_URL;
    delete process.env.DASHBOARD_API_TOKEN;
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ status: "ok", data: "demo", missing: ["DASHBOARD_API_URL", "DASHBOARD_API_TOKEN"] });
  });

  it("says the feed is configured when both settings are present, naming neither value", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env.DASHBOARD_API_TOKEN = "very-secret";
    const body = await GET().json();
    expect(body).toEqual({ status: "ok", data: "feed", missing: [] });
    expect(JSON.stringify(body)).not.toContain("very-secret");
    expect(JSON.stringify(body)).not.toContain("api.example.test");
  });

  it("names the one that is missing or blank", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env.DASHBOARD_API_TOKEN = "   ";
    await expect(GET().json()).resolves.toEqual({ status: "ok", data: "demo", missing: ["DASHBOARD_API_TOKEN"] });
  });
});
