// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => requestHeaders,
}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

import { signIn, signOut } from "@/auth/actions";
import { signInLimiter } from "@/auth/limiter";
import { NOT_CONFIGURED, WRONG_PASSWORD } from "@/auth/messages";
import { hashPassword } from "@/auth/password";
import { SESSION_COOKIE, unsealSession } from "@/auth/sessionCodec";

const SECRET = "0123456789abcdef0123456789abcdef-session-secret";
const FAST = { logN: 10, r: 8, p: 1 };
const saved = { ...process.env };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(async () => {
  jar.clear();
  signInLimiter.clear();
  requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
  process.env.DASHBOARD_PASSWORD_VIEW_HASH = await hashPassword("look-only", FAST);
  process.env.DASHBOARD_PASSWORD_ADMIN_HASH = await hashPassword("change-things", FAST);
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("signIn", () => {
  it("sets a sealed admin session cookie and redirects to the overview", async () => {
    await expect(signIn({}, form({ password: "change-things" }))).rejects.toThrow("REDIRECT /");
    const cookie = jar.get(SESSION_COOKIE)!;
    await expect(unsealSession(cookie.value, SECRET)).resolves.toEqual({ role: "admin" });
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("gives the viewer role for the view password and returns to the page that asked", async () => {
    await expect(signIn({}, form({ password: "look-only", next: "/spend?month=2026-10" }))).rejects.toThrow("REDIRECT /spend?month=2026-10");
    await expect(unsealSession(jar.get(SESSION_COOKIE)!.value, SECRET)).resolves.toEqual({ role: "viewer" });
  });

  it("never follows an off-site or looping next path", async () => {
    await expect(signIn({}, form({ password: "look-only", next: "https://evil.example/" }))).rejects.toThrow("REDIRECT /");
    await expect(signIn({}, form({ password: "look-only", next: "/sign-in" }))).rejects.toThrow("REDIRECT /");
  });

  it("refuses a wrong, empty or absurdly long password without setting a cookie", async () => {
    await expect(signIn({}, form({ password: "guess" }))).resolves.toEqual({ error: WRONG_PASSWORD });
    await expect(signIn({}, form({ password: "" }))).resolves.toEqual({ error: WRONG_PASSWORD });
    await expect(signIn({}, form({ password: "x".repeat(300) }))).resolves.toEqual({ error: WRONG_PASSWORD });
    await expect(signIn({}, form({}))).resolves.toEqual({ error: WRONG_PASSWORD });
    expect(jar.size).toBe(0);
  });

  it("locks an address out after five wrong passwords and says how long to wait", async () => {
    for (let i = 0; i < 5; i += 1) await signIn({}, form({ password: "nope" }));
    await expect(signIn({}, form({ password: "change-things" }))).resolves.toEqual({ error: expect.stringMatching(/^Too many attempts\. Try again in 15 minutes\.$/) });
    expect(jar.size).toBe(0);
    // another address is unaffected
    requestHeaders = new Headers({ "x-forwarded-for": "198.51.100.2" });
    await expect(signIn({}, form({ password: "change-things" }))).rejects.toThrow("REDIRECT /");
  });

  it("forgets an address's misses once it signs in", async () => {
    await signIn({}, form({ password: "nope" }));
    await expect(signIn({}, form({ password: "look-only" }))).rejects.toThrow("REDIRECT /");
    expect(signInLimiter.size).toBe(0);
  });

  it("counts a burst of parallel attempts as it arrives, so at most five from one address get a verdict", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => signIn({}, form({ password: "nope" }))));
    expect(results.filter((r) => r.error === WRONG_PASSWORD)).toHaveLength(5);
    expect(results.filter((r) => /^Too many attempts/.test(r.error ?? ""))).toHaveLength(7);
  });

  it("caps a burst across forged addresses with the shared limit of thirty", async () => {
    const attempts = Array.from({ length: 40 }, (_, i) => {
      requestHeaders = new Headers({ "x-forwarded-for": `203.0.113.${i}` });
      return signIn({}, form({ password: "nope" }));
    });
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.error === WRONG_PASSWORD)).toHaveLength(30);
    expect(results.filter((r) => /^Too many attempts/.test(r.error ?? ""))).toHaveLength(10);
  });

  it("says so, instead of guessing, when the server has no passwords configured", async () => {
    delete process.env.DASHBOARD_PASSWORD_ADMIN_HASH;
    await expect(signIn({}, form({ password: "look-only" }))).resolves.toEqual({ error: NOT_CONFIGURED });
    expect(jar.size).toBe(0);
  });

  it("marks the cookie Secure in production only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(signIn({}, form({ password: "look-only" }))).rejects.toThrow("REDIRECT /");
    expect(jar.get(SESSION_COOKIE)!.options).toMatchObject({ secure: true });
    vi.unstubAllEnvs();
  });
});

describe("signOut", () => {
  it("deletes the cookie and goes to sign-in", async () => {
    jar.set(SESSION_COOKIE, { value: "anything" });
    await expect(signOut()).rejects.toThrow("REDIRECT /sign-in");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});
