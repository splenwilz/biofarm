// @vitest-environment node
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "@/auth/password";
import { sealSession, SESSION_COOKIE } from "@/auth/sessionCodec";
import { config, proxy } from "@/proxy";

const SECRET = "0123456789abcdef0123456789abcdef-session-secret";
const saved = { ...process.env };

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(new URL(path, "https://dash.example"));
  if (cookie) req.cookies.set(SESSION_COOKIE, cookie);
  return req;
}

beforeEach(async () => {
  const hash = await hashPassword("x", { logN: 10, r: 8, p: 1 });
  process.env.DASHBOARD_PASSWORD_VIEW_HASH = hash;
  process.env.DASHBOARD_PASSWORD_ADMIN_HASH = hash;
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("proxy matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

  it("covers the pages, including the sign-in page", () => {
    for (const url of ["/", "/spend", "/spend?month=2026-10", "/kpi-rule", "/sign-in", "/sign-in?next=%2Fspend", "/nowhere"]) expect(matches(url), url).toBe(true);
  });

  it("leaves the API, the health check and static assets alone", () => {
    for (const url of ["/api/events", "/api/events/e1", "/healthz", "/_next/static/chunks/main.js", "/_next/image?url=x", "/favicon.ico", "/logo.png", "/biofarm-hero.jpg", "/photo.jpeg", "/photo.webp", "/icon.svg"]) expect(matches(url), url).toBe(false);
  });
});

describe("proxy", () => {
  it("sends a visitor without a cookie to sign-in, remembering where they were going", async () => {
    const res = await proxy(request("/spend?month=2026-10"));
    expect(getRedirectUrl(res)).not.toBeNull();
    expect(getRedirectUrl(res)).toBe("https://dash.example/sign-in?next=%2Fspend%3Fmonth%3D2026-10");
  });

  it("does not add a next parameter for the overview itself", async () => {
    expect(getRedirectUrl(await proxy(request("/")))).toBe("https://dash.example/sign-in");
  });

  it("treats a forged or expired cookie as no cookie and tells the browser to drop it", async () => {
    const res = await proxy(request("/", "forged"));
    expect(getRedirectUrl(res)).not.toBeNull();
    expect(res.cookies.get(SESSION_COOKIE)).toMatchObject({ value: "" });
  });

  it("lets a valid session through, viewer or admin", async () => {
    for (const role of ["viewer", "admin"] as const) {
      const res = await proxy(request("/events", await sealSession({ role }, SECRET)));
      expect(getRedirectUrl(res), role).toBeNull();
      expect(res.status).toBe(200);
    }
  });

  it("shows the sign-in page to visitors and skips it for people already signed in", async () => {
    expect(getRedirectUrl(await proxy(request("/sign-in")))).toBeNull();
    const signedIn = await proxy(request("/sign-in?next=%2Fspend", await sealSession({ role: "viewer" }, SECRET)));
    expect(getRedirectUrl(signedIn)).toBe("https://dash.example/");
  });

  it("fails closed when the server has no sign-in settings: every page goes to sign-in", async () => {
    delete process.env.DASHBOARD_SESSION_SECRET;
    const res = await proxy(request("/", await sealSession({ role: "admin" }, SECRET)));
    expect(getRedirectUrl(res)).toBe("https://dash.example/sign-in");
  });
});
