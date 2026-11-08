/**
 * Health check for the host (Render pings it every few seconds). Deliberately
 * does not load the dashboard data: a check must not cost a feed request.
 * It also says whether the process can see the feed settings, by name only
 * and never by value, so "why is it showing demo data" has a one-line answer:
 * `missing` names what is absent or blank, `seen` lists every variable whose
 * name contains DASHBOARD (whitespace shown as ␠) so a misspelt key stands out.
 */
const FEED_SETTINGS = ["DASHBOARD_API_URL", "DASHBOARD_API_TOKEN"] as const;

export function GET(): Response {
  const missing = FEED_SETTINGS.filter((name) => !process.env[name]?.trim());
  const seen = Object.keys(process.env)
    .filter((name) => name.toUpperCase().includes("DASHBOARD"))
    .map((name) => name.replace(/\s/g, "␠"))
    .sort();
  return Response.json({ status: "ok", data: missing.length ? "demo" : "feed", missing, seen }, { headers: { "cache-control": "no-store" } });
}
