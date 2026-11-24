/**
 * The session cookie's contents: one word, the role. Sealed (encrypted and
 * signed) with iron-session, which the Next.js authentication guide names
 * for cookie sessions, so the browser can neither read nor forge it. No
 * Next imports here: proxy.ts and the Data Access Layer both use this file.
 */
import { sealData, unsealData } from "iron-session";

import { type Role, ROLES } from "@/auth/roles";

export type { Role } from "@/auth/roles";

export interface Session {
  role: Role;
}

export const SESSION_COOKIE = "biofarm_dashboard_session";
/** Thirty days, then the password is asked for again. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const VERSION = 1;

interface Payload {
  v: number;
  role: Role;
}

export async function sealSession(session: Session, secret: string): Promise<string> {
  const payload: Payload = { v: VERSION, role: session.role };
  return sealData(payload, { password: secret, ttl: SESSION_TTL_SECONDS });
}

/** The session inside a cookie value, or null when it is missing, expired, forged or from another version. */
export async function unsealSession(sealed: string | undefined, secret: string): Promise<Session | null> {
  if (!sealed) return null;
  let payload: Partial<Payload>;
  try {
    // iron-session answers an empty object for a seal it cannot open; the shape check below turns that into null.
    payload = await unsealData<Partial<Payload>>(sealed, { password: secret, ttl: SESSION_TTL_SECONDS });
  } catch {
    return null;
  }
  if (payload.v !== VERSION || !ROLES.includes(payload.role as Role)) return null;
  return { role: payload.role as Role };
}

/**
 * Cookie attributes per the Next.js guide: HttpOnly, Secure over HTTPS,
 * SameSite=Lax (a cross-site POST never carries it), site-wide path, and an
 * expiry just under the seal's so the cookie goes before the seal does.
 * `secure` is off only for plain-HTTP local development.
 */
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS - 60 };
}

/** Only a same-origin path may follow sign-in: never a full URL, never a protocol-relative one. */
export function safeNextPath(candidate: unknown, fallback = "/"): string {
  if (typeof candidate !== "string" || candidate.length > 2048) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\") || /[\r\n]/.test(candidate)) return fallback;
  if (candidate === "/sign-in" || candidate.startsWith("/sign-in?") || candidate.startsWith("/sign-in/")) return fallback;
  return candidate;
}
