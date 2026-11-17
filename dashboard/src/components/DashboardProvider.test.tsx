import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardProvider, useDashboard } from "@/components/DashboardProvider";
import { kpiConfig } from "@/config/kpi";
import { buildDemoData } from "@/data/demo";
import type { DashboardData, EventInput } from "@/lib/types";
import { navState, resetNavigation } from "@/test/navigation";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

const fetchMock = vi.fn();
beforeEach(() => {
  resetNavigation();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const EVENT: EventInput = {
  name: "Lesnewth open day",
  date: "2026-11-24T09:00:00.000Z",
  type: "open_day",
  attendees: null,
  costGbp: null,
  notes: null,
  match: { labels: [], dealSources: [], titleWords: ["Lesnewth"], channel: true, windowFrom: "2026-11-24", windowTo: "2027-03-31" },
};

function hook(data: DashboardData) {
  return renderHook(() => useDashboard(), { wrapper: ({ children }) => <DashboardProvider data={data} config={kpiConfig}>{children}</DashboardProvider> });
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("DashboardProvider events on the feed", () => {
  const live: DashboardData = { ...buildDemoData(), source: "pipedrive" };

  it("posts a new event to /api/events as the API takes it, adopts the stored id and refreshes the page data", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: "stored-1", name: EVENT.name }));
    const { result } = hook(live);
    await act(() => result.current.addEvent(EVENT));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/events");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: EVENT.name, date: "2026-11-24", type: "open_day", attendees: null, costGbp: null, notes: null, match: EVENT.match });
    expect(result.current.events.find((e) => e.id === "stored-1")).toMatchObject({ name: EVENT.name, leads: 0, qualified: 0 });
    expect(navState.refresh).toHaveBeenCalledTimes(1);
  });

  it("throws the API's own detail when the write is refused, adds nothing and does not refresh", async () => {
    fetchMock.mockResolvedValueOnce(json(422, { detail: [{ msg: "String should have at most 100 characters" }] }));
    const { result } = hook(live);
    const before = result.current.events.length;
    await expect(act(() => result.current.addEvent(EVENT))).rejects.toThrow("The event was not saved: String should have at most 100 characters");
    expect(result.current.events).toHaveLength(before);
    expect(navState.refresh).not.toHaveBeenCalled();
  });

  it("updates and removes through the event's own path, taking a 204 without a body", async () => {
    const target = live.events[0]!;
    fetchMock.mockResolvedValueOnce(json(200, { id: target.id })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { result } = hook(live);
    await act(() => result.current.updateEvent(target.id, { ...EVENT, name: "Renamed" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/events/${encodeURIComponent(target.id)}`);
    expect(fetchMock.mock.calls[0]![1].method).toBe("PUT");
    expect(result.current.events.find((e) => e.id === target.id)?.name).toBe("Renamed");
    await act(() => result.current.removeEvent(target.id));
    expect(fetchMock.mock.calls[1]![1].method).toBe("DELETE");
    expect(result.current.events.find((e) => e.id === target.id)).toBeUndefined();
    expect(navState.refresh).toHaveBeenCalledTimes(2);
  });

  it("on demo data keeps every change in the session without calling anything", async () => {
    const { result } = hook(buildDemoData());
    await act(() => result.current.addEvent(EVENT));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.events.find((e) => e.name === EVENT.name)?.id).toMatch(/^event-local-/);
    expect(navState.refresh).not.toHaveBeenCalled();
  });
});
