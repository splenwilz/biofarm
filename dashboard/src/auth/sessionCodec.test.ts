// @vitest-environment node
import { describe, expect, it } from "vitest";

import { safeNextPath, sealSession, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions, unsealSession } from "@/auth/sessionCodec";

const SECRET = "0123456789abcdef0123456789abcdef-session-secret";
const OTHER = "fedcba9876543210fedcba9876543210-other-secret!";

describe("session seal", () => {
  it("round-trips the role and nothing else", async () => {
    const sealed = await sealSession({ role: "admin" }, SECRET);
    expect(sealed).not.toContain("admin");
    await expect(unsealSession(sealed, SECRET)).resolves.toEqual({ role: "admin" });
    await expect(unsealSession(await sealSession({ role: "viewer" }, SECRET), SECRET)).resolves.toEqual({ role: "viewer" });
  });

  it("refuses a missing, forged, tampered or foreign-secret cookie", async () => {
    const sealed = await sealSession({ role: "admin" }, SECRET);
    await expect(unsealSession(undefined, SECRET)).resolves.toBeNull();
    await expect(unsealSession("", SECRET)).resolves.toBeNull();
    await expect(unsealSession("admin", SECRET)).resolves.toBeNull();
    await expect(unsealSession(`${sealed.slice(0, -4)}AAAA`, SECRET)).resolves.toBeNull();
    await expect(unsealSession(sealed, OTHER)).resolves.toBeNull();
  });

  it("names a cookie and attributes the Next.js guide recommends", () => {
    expect(SESSION_COOKIE).toBe("biofarm_dashboard_session");
    expect(SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(sessionCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS - 60 });
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a same-origin path with its query", () => {
    expect(safeNextPath("/spend?month=2026-10")).toBe("/spend?month=2026-10");
    expect(safeNextPath("/")).toBe("/");
  });

  it("falls back to the overview for anything that could leave the site or loop", () => {
    for (const bad of [undefined, null, 42, "", "spend", "https://evil.example/", "//evil.example", "/\\evil.example", "/sign-in", "/sign-in?next=/", "/sign-in/x", "/a\r\nSet-Cookie: x", "/".padEnd(3000, "a")]) {
      expect(safeNextPath(bad), String(bad)).toBe("/");
    }
  });
});
