/**
 * Health check for the host (Render pings it every few seconds). Deliberately
 * does not load the dashboard data: a check must not cost a feed request.
 * It also says whether the process can see the feed settings, by name only
 * and never by value, so "why is it showing demo data" has a one-line answer:
 * `missing` names what is absent or blank, `seen` lists every variable whose
 * name contains DASHBOARD (whitespace shown as ␠) so a misspelt key stands out.
 * `signIn` does the same for the password settings, since with any of them
 * missing nobody can get past the sign-in page.
 */
import { connection } from "next/server";

import { readAuthConfig } from "@/auth/config";

const FEED_SETTINGS = ["DASHBOARD_API_URL", "DASHBOARD_API_TOKEN"] as const;

/**
 * Answered per request, never prerendered. A GET route that reads no request
 * data is otherwise built as static HTML under Cache Components (the segment
 * config `dynamic` is not allowed there), and this one would then report the
 * build machine's environment ("feed", nothing missing) whatever the server
 * actually has. `connection()` is the documented way to wait for a real request.
 */
export async function GET(): Promise<Response> {
  await connection();
  const missing = FEED_SETTINGS.filter((name) => !process.env[name]?.trim());
  const seen = Object.keys(process.env)
    .filter((name) => name.toUpperCase().includes("DASHBOARD"))
    .map((name) => name.replace(/\s/g, "␠"))
    .sort();
  const auth = readAuthConfig(process.env);
  const signIn = auth.ok ? { configured: true, missing: [] } : { configured: false, missing: auth.missing };
  return Response.json({ status: "ok", data: missing.length ? "demo" : "feed", missing, seen, signIn }, { headers: { "cache-control": "no-store" } });
}
