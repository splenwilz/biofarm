import "server-only";

import { FEED_TIMEOUT_MS } from "@/data/api";

/** Statuses the Fetch spec forbids a body on: the forwarded reply must be built with a null body or the constructor throws. */
const NO_BODY = new Set([204, 205, 304]);

/** The request body as JSON, or the 400 to send back when it is not JSON. */
export async function readJson(request: Request): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: Response.json({ detail: "The request body is not valid JSON" }, { status: 400, headers: { "cache-control": "no-store" } }) };
  }
}

/**
 * Forwards an event write from the browser to the lead API. Runs on the
 * server only, so the shared token stays out of the browser: the page calls
 * /api/events (a Next route handler), which calls this. Without the feed
 * settings the dashboard is on demo data and there is nothing to write to.
 * The API's own answer (201, 404, 422 with its detail) is passed through as
 * is; an API that cannot be reached is a 502 with a message the dialog can show.
 */
export async function forwardEventWrite(env: Record<string, string | undefined>, method: "POST" | "PUT" | "DELETE", path: string, body: unknown): Promise<Response> {
  const url = env.DASHBOARD_API_URL?.trim();
  const token = env.DASHBOARD_API_TOKEN?.trim();
  if (!url || !token) {
    return Response.json({ detail: "Demo data: events are kept for this session only" }, { status: 501, headers: { "cache-control": "no-store" } });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${url.replace(/\/$/, "")}/v1/dashboard/events${path}`, {
      method,
      headers: { "x-dashboard-token": token, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ detail: "The lead API could not be reached; nothing was changed" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
  const headers = { "cache-control": "no-store" };
  if (NO_BODY.has(upstream.status)) return new Response(null, { status: upstream.status, headers });
  return new Response(await upstream.text(), { status: upstream.status, headers: { ...headers, "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}
