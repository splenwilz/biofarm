/**
 * The front door (Next.js `proxy` file convention, Node runtime). Every page
 * request needs a valid session cookie or is sent to /sign-in with the page
 * to come back to. This is the optimistic check the authentication guide
 * describes: it reads only the cookie. The real refusals live beside the data,
 * in the layout (requireSession) and the write routes (requireAdminForRoute),
 * because Server Functions and route handlers are reachable without a page.
 *
 * Left out of the matcher: /api (its handlers answer 401/403 JSON themselves),
 * /healthz (Render's check must never see a redirect), Next's own assets and
 * static files.
 */
import { type NextRequest, NextResponse } from "next/server";

import { readAuthConfig } from "@/auth/config";
import { SESSION_COOKIE, unsealSession } from "@/auth/sessionCodec";

export const SIGN_IN_PATH = "/sign-in";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const config = readAuthConfig(process.env);
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  const session = config.ok ? await unsealSession(sealed, config.sessionSecret) : null;

  if (pathname === SIGN_IN_PATH) {
    // Already signed in: nothing to do here. Otherwise show the page (and let its action POST through).
    return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (session) return NextResponse.next();

  const target = new URL(SIGN_IN_PATH, request.url);
  const wanted = `${pathname}${search}`;
  if (wanted !== "/") target.searchParams.set("next", wanted);
  const response = NextResponse.redirect(target);
  // A cookie that did not open (expired, old secret) is dead weight: drop it.
  if (sealed) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  // Every image extension served from public/ must be listed: next/image's
  // optimizer fetches the source file through this server, so a .jpg the
  // matcher did not exclude came back as a redirect to /sign-in and the
  // optimizer answered 500 (seen 24 Nov 2026 with the sign-in photo).
  matcher: ["/((?!api/|_next/static|_next/image|healthz|favicon\\.ico|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|webmanifest|txt|xml)$).*)"],
};
