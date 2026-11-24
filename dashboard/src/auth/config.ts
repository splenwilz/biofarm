/**
 * The sign-in settings, read from the environment by name. Nothing else in
 * the app reads these variables (the Data Access Layer rule from the Next.js
 * data-security guide). Sign-in fails closed: with any of the three missing
 * or malformed, nobody can sign in and /healthz names what is absent.
 */
import { parseStoredHash } from "@/auth/password";

export const AUTH_SETTINGS = ["DASHBOARD_PASSWORD_VIEW_HASH", "DASHBOARD_PASSWORD_ADMIN_HASH", "DASHBOARD_SESSION_SECRET"] as const;
export type AuthSetting = (typeof AUTH_SETTINGS)[number];

/** iron-session refuses shorter passwords; the hash script prints one of 43 characters. */
export const MIN_SESSION_SECRET_LENGTH = 32;

export type AuthConfig = { ok: true; viewHash: string; adminHash: string; sessionSecret: string } | { ok: false; missing: AuthSetting[] };

export function readAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const value = (name: AuthSetting) => env[name]?.trim() ?? "";
  const viewHash = value("DASHBOARD_PASSWORD_VIEW_HASH");
  const adminHash = value("DASHBOARD_PASSWORD_ADMIN_HASH");
  const sessionSecret = value("DASHBOARD_SESSION_SECRET");
  const missing: AuthSetting[] = [];
  if (!parseStoredHash(viewHash)) missing.push("DASHBOARD_PASSWORD_VIEW_HASH");
  if (!parseStoredHash(adminHash)) missing.push("DASHBOARD_PASSWORD_ADMIN_HASH");
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) missing.push("DASHBOARD_SESSION_SECRET");
  if (missing.length) return { ok: false, missing };
  return { ok: true, viewHash, adminHash, sessionSecret };
}
