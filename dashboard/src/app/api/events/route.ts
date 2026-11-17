import { forwardEventWrite, readJson } from "@/data/eventsApi";

/** POST /api/events: add a marketing event (forwarded to the lead API with the server's token). */
export async function POST(request: Request): Promise<Response> {
  const parsed = await readJson(request);
  if ("response" in parsed) return parsed.response;
  return forwardEventWrite(process.env, "POST", "", parsed.body);
}
