// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AUTH_SETTINGS, readAuthConfig } from "@/auth/config";

const HASH = "scrypt:15:8:3:c2FsdHNhbHRzYWx0c2Fs:aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";
const SECRET = "a".repeat(32);

describe("readAuthConfig", () => {
  it("names the three settings sign-in needs", () => {
    expect(AUTH_SETTINGS).toEqual(["DASHBOARD_PASSWORD_VIEW_HASH", "DASHBOARD_PASSWORD_ADMIN_HASH", "DASHBOARD_SESSION_SECRET"]);
  });

  it("returns the two hashes and the secret when all are set", () => {
    const config = readAuthConfig({ DASHBOARD_PASSWORD_VIEW_HASH: HASH, DASHBOARD_PASSWORD_ADMIN_HASH: HASH, DASHBOARD_SESSION_SECRET: SECRET });
    expect(config).toEqual({ ok: true, viewHash: HASH, adminHash: HASH, sessionSecret: SECRET });
  });

  it("lists what is missing or blank, by name, never by value", () => {
    expect(readAuthConfig({})).toEqual({ ok: false, missing: ["DASHBOARD_PASSWORD_VIEW_HASH", "DASHBOARD_PASSWORD_ADMIN_HASH", "DASHBOARD_SESSION_SECRET"] });
    expect(readAuthConfig({ DASHBOARD_PASSWORD_VIEW_HASH: HASH, DASHBOARD_PASSWORD_ADMIN_HASH: "  ", DASHBOARD_SESSION_SECRET: SECRET })).toEqual({ ok: false, missing: ["DASHBOARD_PASSWORD_ADMIN_HASH"] });
  });

  it("treats a session secret under 32 characters as missing (iron-session's minimum)", () => {
    const short = readAuthConfig({ DASHBOARD_PASSWORD_VIEW_HASH: HASH, DASHBOARD_PASSWORD_ADMIN_HASH: HASH, DASHBOARD_SESSION_SECRET: "too-short" });
    expect(short).toEqual({ ok: false, missing: ["DASHBOARD_SESSION_SECRET"] });
  });

  it("treats a hash that is not in the scrypt format as missing, so a plain password pasted by mistake never works", () => {
    const plain = readAuthConfig({ DASHBOARD_PASSWORD_VIEW_HASH: "letmein", DASHBOARD_PASSWORD_ADMIN_HASH: HASH, DASHBOARD_SESSION_SECRET: SECRET });
    expect(plain).toEqual({ ok: false, missing: ["DASHBOARD_PASSWORD_VIEW_HASH"] });
  });

  it("trims surrounding whitespace, which Render's form and copy-paste add", () => {
    const config = readAuthConfig({ DASHBOARD_PASSWORD_VIEW_HASH: ` ${HASH} `, DASHBOARD_PASSWORD_ADMIN_HASH: `${HASH}\n`, DASHBOARD_SESSION_SECRET: ` ${SECRET} ` });
    expect(config).toMatchObject({ ok: true, viewHash: HASH, adminHash: HASH, sessionSecret: SECRET });
  });
});
