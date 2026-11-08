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
    await expect(res.json()).resolves.toEqual({ status: "ok", data: "demo", missing: ["DASHBOARD_API_URL", "DASHBOARD_API_TOKEN"], seen: [] });
  });

  it("lists the names of look-alike settings so a misspelt key shows up, values never", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env["DASHBOARD_API_TOKEN "] = "very-secret"; // trailing space in the key
    process.env.DASHBOARD_TOKEN = "also-secret";
    const body = await GET().json();
    expect(body.missing).toEqual(["DASHBOARD_API_TOKEN"]);
    expect(body.seen).toEqual(["DASHBOARD_API_TOKEN␠", "DASHBOARD_API_URL", "DASHBOARD_TOKEN"]);
    expect(JSON.stringify(body)).not.toMatch(/secret|example\.test/);
    delete process.env["DASHBOARD_API_TOKEN "];
    delete process.env.DASHBOARD_TOKEN;
  });

  it("says the feed is configured when both settings are present, naming neither value", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env.DASHBOARD_API_TOKEN = "very-secret";
    const body = await GET().json();
    expect(body).toEqual({ status: "ok", data: "feed", missing: [], seen: ["DASHBOARD_API_TOKEN", "DASHBOARD_API_URL"] });
    expect(JSON.stringify(body)).not.toContain("very-secret");
    expect(JSON.stringify(body)).not.toContain("api.example.test");
  });

  it("names the one that is missing or blank", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env.DASHBOARD_API_TOKEN = "   ";
    await expect(GET().json()).resolves.toEqual({ status: "ok", data: "demo", missing: ["DASHBOARD_API_TOKEN"], seen: ["DASHBOARD_API_TOKEN", "DASHBOARD_API_URL"] });
  });
});
