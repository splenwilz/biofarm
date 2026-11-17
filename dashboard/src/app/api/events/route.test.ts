// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DELETE, PUT } from "@/app/api/events/[id]/route";
import { POST } from "@/app/api/events/route";

const saved = { ...process.env };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.DASHBOARD_API_URL = "https://api.example.test/";
  process.env.DASHBOARD_API_TOKEN = "very-secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
});

const EVENT = { name: "UKREiiF 2026", date: "2026-05-20", type: "trade_show", costGbp: 3400, match: { labels: [], dealSources: [], titleWords: [], channel: true, windowFrom: "2026-05-01", windowTo: "2026-09-30" } };

describe("/api/events", () => {
  it("forwards a create to the lead API with the server's token and returns its answer", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e1", ...EVENT }), { status: 201, headers: { "content-type": "application/json" } }));
    const res = await POST(new Request("http://dash/api/events", { method: "POST", body: JSON.stringify(EVENT) }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: "e1", name: "UKREiiF 2026" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/dashboard/events");
    expect(init.method).toBe("POST");
    expect(init.headers["x-dashboard-token"]).toBe("very-secret");
    expect(JSON.parse(init.body)).toEqual(EVENT);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("forwards an update and a delete to the event's own path, and passes a 404 through", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "e1", ...EVENT, costGbp: 3600 }), { status: 200, headers: { "content-type": "application/json" } }));
    const put = await PUT(new Request("http://dash/api/events/e1", { method: "PUT", body: JSON.stringify({ ...EVENT, costGbp: 3600 }) }), { params: Promise.resolve({ id: "e1" }) });
    expect(put.status).toBe(200);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/v1/dashboard/events/e1");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const del = await DELETE(new Request("http://dash/api/events/e%201", { method: "DELETE" }), { params: Promise.resolve({ id: "e 1" }) });
    expect(del.status).toBe(204); // a 204 must be rebuilt with a null body, or the Response constructor throws and the delete reads as a 500
    expect(del.body).toBeNull();
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.example.test/v1/dashboard/events/e%201");
    expect(fetchMock.mock.calls[1]![1].body).toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "No such event" }), { status: 404, headers: { "content-type": "application/json" } }));
    expect((await DELETE(new Request("http://dash/api/events/zz", { method: "DELETE" }), { params: Promise.resolve({ id: "zz" }) })).status).toBe(404);
  });

  it("answers 400 to a body that is not JSON and 502 when the lead API cannot be reached, each with a detail the dialog can show", async () => {
    const bad = await POST(new Request("http://dash/api/events", { method: "POST", body: "{nope" }));
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toEqual({ detail: "The request body is not valid JSON" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const down = await PUT(new Request("http://dash/api/events/e1", { method: "PUT", body: JSON.stringify(EVENT) }), { params: Promise.resolve({ id: "e1" }) });
    expect(down.status).toBe(502);
    await expect(down.json()).resolves.toEqual({ detail: "The lead API could not be reached; nothing was changed" });
  });

  it("answers 501 on demo data, without calling anything", async () => {
    delete process.env.DASHBOARD_API_TOKEN;
    const res = await POST(new Request("http://dash/api/events", { method: "POST", body: JSON.stringify(EVENT) }));
    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toMatchObject({ detail: expect.stringMatching(/demo/i) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
