/**
 * Data Access Layer for the session (Next.js authentication guide): the one
 * place that reads the cookie and the sign-in settings. Server Components,
 * Server Actions and Route Handlers call these; nothing here reaches the client.
 */
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { readAuthConfig } from "@/auth/config";
import { SESSION_COOKIE, type Session, unsealSession } from "@/auth/sessionCodec";

/** The signed-in session, or null. Memoised for one render pass (React cache). */
export const getSession = cache(async (): Promise<Session | null> => {
  const config = readAuthConfig(process.env);
  if (!config.ok) return null;
  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  return unsealSession(sealed, config.sessionSecret);
});

/** The sign-in URL that returns to `path` afterwards. */
export function signInHref(path: string): string {
  return path && path !== "/" ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in";
}

/** For pages: the session, or a redirect to sign-in that comes back to `path`. */
export async function requireSession(path = "/"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(signInHref(path));
  return session;
}

/**
 * For Route Handlers that change things: null when the caller is an admin,
 * otherwise the JSON refusal to send (401 without a session, 403 for a viewer).
 * The messages are what the dialogs show.
 */
export async function requireAdminForRoute(): Promise<Response | null> {
  const session = await getSession();
  const headers = { "cache-control": "no-store" };
  if (!session) return Response.json({ detail: "Your sign-in has expired. Reload the page and sign in again." }, { status: 401, headers });
  if (session.role !== "admin") return Response.json({ detail: "View-only access cannot make changes. Sign in with the admin password to edit." }, { status: 403, headers });
  return null;
}
