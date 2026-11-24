// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

import { hashPassword } from "@/auth/password";
import { getSession, requireAdminForRoute, requireSession, signInHref } from "@/auth/session";
import { sealSession, SESSION_COOKIE } from "@/auth/sessionCodec";

const SECRET = "0123456789abcdef0123456789abcdef-session-secret";
const saved = { ...process.env };

beforeEach(async () => {
  jar.clear();
  const hash = await hashPassword("x", { logN: 10, r: 8, p: 1 });
  process.env.DASHBOARD_PASSWORD_VIEW_HASH = hash;
  process.env.DASHBOARD_PASSWORD_ADMIN_HASH = hash;
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("getSession", () => {
  it("is null without a cookie, with a bad cookie, and when sign-in is not configured", async () => {
    await expect(getSession()).resolves.toBeNull();
    jar.set(SESSION_COOKIE, "garbage");
    await expect(getSession()).resolves.toBeNull();
    jar.set(SESSION_COOKIE, await sealSession({ role: "admin" }, SECRET));
    delete process.env.DASHBOARD_SESSION_SECRET;
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the role from a valid cookie", async () => {
    jar.set(SESSION_COOKIE, await sealSession({ role: "viewer" }, SECRET));
    await expect(getSession()).resolves.toEqual({ role: "viewer" });
  });
});

describe("requireSession", () => {
  it("redirects to sign-in, carrying the page to come back to", async () => {
    await expect(requireSession("/spend?month=2026-10")).rejects.toThrow("REDIRECT /sign-in?next=%2Fspend%3Fmonth%3D2026-10");
    await expect(requireSession("/")).rejects.toThrow("REDIRECT /sign-in");
    expect(signInHref("")).toBe("/sign-in");
  });

  it("returns the session when signed in", async () => {
    jar.set(SESSION_COOKIE, await sealSession({ role: "admin" }, SECRET));
    await expect(requireSession("/")).resolves.toEqual({ role: "admin" });
  });
});

describe("requireAdminForRoute", () => {
  it("answers 401 with no session and 403 for a viewer, both uncached JSON", async () => {
    const none = (await requireAdminForRoute())!;
    expect(none.status).toBe(401);
    expect(none.headers.get("cache-control")).toBe("no-store");
    await expect(none.json()).resolves.toEqual({ detail: expect.stringMatching(/sign in again/i) });
    jar.set(SESSION_COOKIE, await sealSession({ role: "viewer" }, SECRET));
    const viewer = (await requireAdminForRoute())!;
    expect(viewer.status).toBe(403);
    await expect(viewer.json()).resolves.toEqual({ detail: expect.stringMatching(/view-only/i) });
  });

  it("lets an admin through", async () => {
    jar.set(SESSION_COOKIE, await sealSession({ role: "admin" }, SECRET));
    await expect(requireAdminForRoute()).resolves.toBeNull();
  });
});
