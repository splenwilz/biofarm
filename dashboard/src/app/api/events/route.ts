import { requireAdminForRoute } from "@/auth/session";
import { forwardEventWrite, readJson } from "@/data/eventsApi";

/** POST /api/events: add a marketing event (forwarded to the lead API with the server's token). Admin only. */
export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminForRoute();
  if (denied) return denied;
  const parsed = await readJson(request);
  if ("response" in parsed) return parsed.response;
  return forwardEventWrite(process.env, "POST", "", parsed.body);
}
