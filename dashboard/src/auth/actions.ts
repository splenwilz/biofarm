"use server";

/**
 * Sign in and sign out, as Server Actions (POST only, same-origin checked by
 * Next). Everything the action trusts is re-read here: the settings, the
 * password, the client key; nothing comes from the page's state.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { readAuthConfig } from "@/auth/config";
import { clientKey, signInLimiter } from "@/auth/limiter";
import { NOT_CONFIGURED, WRONG_PASSWORD } from "@/auth/messages";
import { verifyPassword } from "@/auth/password";
import { type Role, safeNextPath, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/auth/sessionCodec";

export interface SignInState {
  /** What to tell the person; absent on the initial render. */
  error?: string;
}

/** Longer than any password anyone would type; stops a megabyte being fed to scrypt. */
const MAX_PASSWORD_LENGTH = 256;

function waitMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Which role the password unlocks, or null. Both hashes are checked every time, so the answer takes the same work whichever it is. */
async function roleFor(password: string, viewHash: string, adminHash: string): Promise<Role | null> {
  const [admin, viewer] = await Promise.all([verifyPassword(password, adminHash), verifyPassword(password, viewHash)]);
  if (admin) return "admin";
  if (viewer) return "viewer";
  return null;
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const config = readAuthConfig(process.env);
  if (!config.ok) return { error: NOT_CONFIGURED };

  const password = formData.get("password");
  const next = safeNextPath(formData.get("next"));
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return { error: WRONG_PASSWORD };

  // Check and reserve in the same tick: the hash below takes a moment, and a
  // burst of parallel requests must not all pass while the first one computes.
  const key = clientKey(await headers());
  const limit = signInLimiter.check(key);
  if (!limit.allowed) return { error: waitMessage(limit.retryAfterMs) };
  signInLimiter.reserve(key);

  const role = await roleFor(password, config.viewHash, config.adminHash);
  if (!role) return { error: WRONG_PASSWORD };
  signInLimiter.forgive(key);

  const sealed = await sealSession({ role }, config.sessionSecret);
  (await cookies()).set(SESSION_COOKIE, sealed, sessionCookieOptions(process.env.NODE_ENV === "production"));
  redirect(next); // throws; must stay outside any try/catch
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
