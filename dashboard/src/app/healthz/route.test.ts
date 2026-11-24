import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/healthz/route";

const connection = vi.fn(async () => undefined);
vi.mock("next/server", () => ({ connection: () => connection() }));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("GET /healthz", () => {
  it("waits for a real request (connection) so it is never prerendered with the build machine's settings", async () => {
    connection.mockClear();
    await GET();
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("answers 200 with a small JSON body and no caching, without touching the feed", async () => {
    delete process.env.DASHBOARD_API_URL;
    delete process.env.DASHBOARD_API_TOKEN;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ status: "ok", data: "demo", missing: ["DASHBOARD_API_URL", "DASHBOARD_API_TOKEN"], seen: [], signIn: { configured: false, missing: ["DASHBOARD_PASSWORD_VIEW_HASH", "DASHBOARD_PASSWORD_ADMIN_HASH", "DASHBOARD_SESSION_SECRET"] } });
  });

  it("lists the names of look-alike settings so a misspelt key shows up, values never", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env["DASHBOARD_API_TOKEN "] = "very-secret"; // trailing space in the key
    process.env.DASHBOARD_TOKEN = "also-secret";
    const body = await (await GET()).json();
    expect(body.missing).toEqual(["DASHBOARD_API_TOKEN"]);
    expect(body.seen).toEqual(["DASHBOARD_API_TOKEN␠", "DASHBOARD_API_URL", "DASHBOARD_TOKEN"]);
    expect(JSON.stringify(body)).not.toMatch(/secret|example\.test/);
    delete process.env["DASHBOARD_API_TOKEN "];
    delete process.env.DASHBOARD_TOKEN;
  });

  it("says the feed is configured when both settings are present, naming neither value", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env.DASHBOARD_API_TOKEN = "very-secret";
    const body = await (await GET()).json();
    expect(body).toMatchObject({ status: "ok", data: "feed", missing: [], seen: ["DASHBOARD_API_TOKEN", "DASHBOARD_API_URL"] });
    expect(JSON.stringify(body)).not.toContain("very-secret");
    expect(JSON.stringify(body)).not.toContain("api.example.test");
  });

  it("names the one that is missing or blank", async () => {
    process.env.DASHBOARD_API_URL = "https://api.example.test";
    process.env.DASHBOARD_API_TOKEN = "   ";
    await expect((await GET()).json()).resolves.toMatchObject({ status: "ok", data: "demo", missing: ["DASHBOARD_API_TOKEN"], seen: ["DASHBOARD_API_TOKEN", "DASHBOARD_API_URL"] });
  });
});

describe("GET /healthz sign-in settings", () => {
  it("says sign-in is configured only when both hashes parse and the secret is long enough, naming what is missing", async () => {
    process.env.DASHBOARD_PASSWORD_VIEW_HASH = "scrypt:15:8:3:c2FsdHNhbHRzYWx0c2Fs:aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";
    process.env.DASHBOARD_PASSWORD_ADMIN_HASH = "not-a-hash";
    process.env.DASHBOARD_SESSION_SECRET = "short";
    let body = await (await GET()).json();
    expect(body.signIn).toEqual({ configured: false, missing: ["DASHBOARD_PASSWORD_ADMIN_HASH", "DASHBOARD_SESSION_SECRET"] });
    expect(JSON.stringify(body)).not.toContain("c2FsdHNhbHQ");
    process.env.DASHBOARD_PASSWORD_ADMIN_HASH = process.env.DASHBOARD_PASSWORD_VIEW_HASH;
    process.env.DASHBOARD_SESSION_SECRET = "x".repeat(32);
    body = await (await GET()).json();
    expect(body.signIn).toEqual({ configured: true, missing: [] });
  });
});
