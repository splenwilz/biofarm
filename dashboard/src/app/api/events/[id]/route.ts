import { requireAdminForRoute } from "@/auth/session";
import { forwardEventWrite, readJson } from "@/data/eventsApi";

type Context = { params: Promise<{ id: string }> };

/** PUT /api/events/:id: change an event's details, cost or Pipedrive match. Admin only. */
export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const denied = await requireAdminForRoute();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await readJson(request);
  if ("response" in parsed) return parsed.response;
  return forwardEventWrite(process.env, "PUT", `/${encodeURIComponent(id)}`, parsed.body);
}

/** DELETE /api/events/:id. Admin only. */
export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const denied = await requireAdminForRoute();
  if (denied) return denied;
  const { id } = await params;
  return forwardEventWrite(process.env, "DELETE", `/${encodeURIComponent(id)}`, undefined);
}
