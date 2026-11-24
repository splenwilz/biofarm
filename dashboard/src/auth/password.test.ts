// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/auth/password";

// Small parameters keep the suite fast; production defaults are OWASP's.
const FAST = { logN: 10, r: 8, p: 1 };

describe("password hashes", () => {
  it("produce a self-describing colon-separated string whose parts can be checked later", async () => {
    const stored = await hashPassword("correct horse battery staple", FAST);
    const parts = stored.split(":");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(parts.slice(1, 4)).toEqual(["10", "8", "1"]);
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 random bytes, base64url, no padding
    expect(parts[5]).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32-byte key
  });

  it("use a fresh salt every time, so equal passwords never share a hash", async () => {
    const a = await hashPassword("same", FAST);
    const b = await hashPassword("same", FAST);
    expect(a).not.toBe(b);
    await expect(verifyPassword("same", a)).resolves.toBe(true);
    await expect(verifyPassword("same", b)).resolves.toBe(true);
  });

  it("verify the right password and refuse a wrong one, including near misses", async () => {
    const stored = await hashPassword("Rycote-2026!", FAST);
    await expect(verifyPassword("Rycote-2026!", stored)).resolves.toBe(true);
    await expect(verifyPassword("Rycote-2026", stored)).resolves.toBe(false);
    await expect(verifyPassword("rycote-2026!", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("default to OWASP's scrypt settings (N=2^15, r=8, p=3)", async () => {
    const stored = await hashPassword("x");
    expect(stored.split(":").slice(1, 4)).toEqual(["15", "8", "3"]);
    await expect(verifyPassword("x", stored)).resolves.toBe(true);
  }, 20_000);

  it("refuse a malformed or tampered stored value without throwing", async () => {
    const stored = await hashPassword("pw", FAST);
    const cases = [
      "",
      "plaintext",
      "bcrypt:10:abc:def",
      "scrypt$10$8$1$c2FsdA$aGFzaA", // the old dollar form, which .env loaders mangle, is not accepted
      stored.replace(/^scrypt:10/, "scrypt:99"), // absurd cost
      stored.replace(/^scrypt:10/, "scrypt:abc"),
      stored.slice(0, -3), // truncated hash
      `${stored}AAA`, // longer hash
      stored.split(":").slice(0, 5).join(":"), // missing hash
    ];
    for (const bad of cases) {
      await expect(verifyPassword("pw", bad), bad).resolves.toBe(false);
    }
  });

  it("accept any Unicode password and treat it byte for byte", async () => {
    const stored = await hashPassword("pässwörd ✓", FAST);
    await expect(verifyPassword("pässwörd ✓", stored)).resolves.toBe(true);
    await expect(verifyPassword("pässwörd ✗", stored)).resolves.toBe(false);
  });
});

describe("npm run password-hash", () => {
  it("prints a hash this module verifies, and a 32+ character session secret, reading the password from stdin", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("node", ["scripts/password-hash.mjs"], { cwd: process.cwd(), input: "correct horse battery staple\n", encoding: "utf8" });
    const hash = out.match(/^scrypt:\S+$/m)?.[0];
    expect(hash).toBeDefined();
    expect(hash!.split(":").slice(1, 4)).toEqual(["15", "8", "3"]);
    await expect(verifyPassword("correct horse battery staple", hash!)).resolves.toBe(true);
    await expect(verifyPassword("correct horse battery stapl", hash!)).resolves.toBe(false);
    const secret = out.split("\n").filter((l) => /^[A-Za-z0-9_-]{43}$/.test(l)).at(-1);
    expect(secret).toBeDefined();
  }, 20_000);

  it("refuses a short password with a message and exit code 1", async () => {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync("node", ["scripts/password-hash.mjs"], { cwd: process.cwd(), input: "short\n", encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/at least 8 characters/);
    expect(res.stdout).not.toMatch(/scrypt:/);
  });
});
