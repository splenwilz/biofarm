import { describe, expect, it } from "vitest";

import { buildDemoData } from "@/data/demo";
import { cpdReport } from "@/lib/cpd";
import { monthRange } from "@/lib/kpi";

const months = monthRange("2026-11", 5); // Jul to Nov 2026

describe("cpdReport", () => {
  it("lays the feed's months onto the report window and totals them", () => {
    const r = cpdReport([{ month: "2026-10", bookings: 2 }, { month: "2026-11", bookings: 3 }], months);
    expect(r.byMonth).toEqual([0, 0, 0, 2, 3]);
    expect(r.total).toBe(5);
    expect(r.thisMonth).toBe(3);
    expect(r.prevMonth).toBe(2);
    expect(r.firstMonth).toBe("2026-10");
  });

  it("shows zeros, not an error, on a feed from before the line existed", () => {
    const r = cpdReport(undefined, months);
    expect(r.byMonth).toEqual([0, 0, 0, 0, 0]);
    expect(r.total).toBe(0);
    expect(r.firstMonth).toBeNull();
  });

  it("ignores months outside the window", () => {
    const r = cpdReport([{ month: "2026-06", bookings: 9 }, { month: "2026-12", bookings: 9 }], months);
    expect(r.total).toBe(0);
  });

  it("reads the demo data's own series", () => {
    const data = buildDemoData();
    expect(data.cpdBookings?.length).toBeGreaterThan(0);
    expect(data.cpdBookings?.every((r) => /^\d{4}-\d{2}$/.test(r.month) && r.month >= "2026-07" && r.bookings >= 0)).toBe(true);
    expect(data.enquiries.some((e) => e.form === "cpd")).toBe(false); // bookings are not enquiries
    const r = cpdReport(data.cpdBookings, months);
    expect(r.total).toBe(data.cpdBookings!.filter((m) => months.includes(m.month)).reduce((s, m) => s + m.bookings, 0));
  });
});
