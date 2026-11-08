/**
 * Health check for the host (Render pings it every few seconds). Deliberately
 * does not load the dashboard data: a check must not cost a feed request.
 */
export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
