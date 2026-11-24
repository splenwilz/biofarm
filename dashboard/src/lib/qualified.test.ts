import { describe, expect, it } from "vitest";

import { kpiConfig } from "@/config/kpi";
import { buildDemoData, DEMO_LAST_MONTH } from "@/data/demo";
import { howItCameIn, qualifiedCsvRows, qualifiedList } from "@/lib/qualified";
import { monthRange, qualifiedByMonth, qualifiedInbound } from "@/lib/kpi";
import type { Deal, Enquiry } from "@/lib/types";

const data = buildDemoData();
const months = monthRange(DEMO_LAST_MONTH, 3);

function deal(over: Partial<Deal> = {}): Deal {
  return { id: "d1", pipeline: "developer", channel: "Website", createdAt: "2026-10-03T09:00:00Z", qualifiedAt: "2026-10-03T09:00:00Z", status: "open", sourceLabel: "google / cpc", campaign: null, personId: 5, ...over };
}
function enquiry(over: Partial<Enquiry> = {}): Enquiry {
  return { id: "L1", createdAt: "2026-10-01T09:00:00Z", kind: "lead", form: "contact", audience: "developer", channel: "Website", sourceLabel: "google / cpc", campaign: null, landingPage: "/developers", firstContactAt: null, personId: 5, archived: false, converted: false, ...over };
}

describe("qualifiedList", () => {
  it("lists every record that qualified in the window, newest first, and counts them the way the tiles do", () => {
    const list = qualifiedList(data.deals, data.enquiries, kpiConfig, months);
    const byMonth = qualifiedByMonth(data.deals, months, kpiConfig);
    expect(list.counts.inbound).toBe(byMonth.reduce((s, m) => s + m.inbound, 0));
    expect(list.counts.network).toBe(byMonth.reduce((s, m) => s + m.network, 0));
    expect(list.counts.unattributed).toBe(byMonth.reduce((s, m) => s + m.unattributed, 0));
    expect(list.counts.all).toBe(list.counts.inbound + list.counts.network + list.counts.unattributed);
    expect(list.rows).toHaveLength(list.counts.all);
    expect(list.rows.filter((r) => r.inbound).map((r) => r.deal.id).sort()).toEqual(
      qualifiedInbound(data.deals, kpiConfig).filter((d) => months.includes(d.qualifiedAt!.slice(0, 7))).map((d) => d.id).sort(),
    );
    const dates = list.rows.map((r) => r.deal.qualifiedAt!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("follows the audience filter", () => {
    const landowner = qualifiedList(data.deals, data.enquiries, kpiConfig, months, "landowner");
    expect(landowner.rows.every((r) => r.deal.pipeline === "landowner")).toBe(true);
    expect(landowner.counts.all).toBe(qualifiedByMonth(data.deals, months, kpiConfig, "landowner").reduce((s, m) => s + m.inbound + m.network + m.unattributed, 0));
  });

  it("gives each row a verdict in words from the agreed channel lists", () => {
    const rows = qualifiedList([deal(), deal({ id: "d2", channel: "Existing Network" }), deal({ id: "d3", channel: null })], [], kpiConfig, ["2026-10"]).rows;
    expect(rows.map((r) => [r.deal.id, r.inbound, r.verdict])).toEqual([
      ["d1", true, "Website: an inbound channel"],
      ["d2", false, "Existing Network: outbound or network, not inbound"],
      ["d3", false, "No source channel set: not inbound"],
    ]);
  });

  it("finds the enquiry a deal came in as, by the lead it was converted from or by its own id", () => {
    const converted = deal({ id: "d9", sourceLeadId: "L1", origin: "website" });
    const direct = deal({ id: "d10", origin: "team", createdBy: "Francis Morrison-Bell" });
    const rows = qualifiedList([converted, direct], [enquiry(), enquiry({ id: "d10", kind: "deal", form: null, channel: "Existing Network" })], kpiConfig, ["2026-10"]).rows;
    expect(rows.find((r) => r.deal.id === "d9")?.enquiry?.id).toBe("L1");
    expect(rows.find((r) => r.deal.id === "d10")?.enquiry?.id).toBe("d10");
  });
});

describe("howItCameIn", () => {
  it("names the website form when the enquiry is known, else the origin, else who made it", () => {
    expect(howItCameIn(deal({ origin: "website" }), enquiry({ form: "contact" }))).toBe("Website: contact form");
    expect(howItCameIn(deal({ origin: "website" }), enquiry({ form: "landowner", landingPage: "/landowners" }))).toBe("Website: landowner form");
    expect(howItCameIn(deal({ origin: "website" }), null)).toBe("Website");
    expect(howItCameIn(deal({ origin: "team", createdBy: "Izzy Pitt" }), null)).toBe("Created by Izzy Pitt");
    expect(howItCameIn(deal({ origin: "team", createdBy: null }), null)).toBe("Created by the team");
    expect(howItCameIn(deal({ origin: "import" }), null)).toBe("Imported in bulk");
    expect(howItCameIn(deal({}), null)).toBe("Not recorded");
  });
});

describe("qualifiedCsvRows", () => {
  it("writes the list with the verdict so it can be sent to anyone who doubts the number", () => {
    const list = qualifiedList([deal({ personName: "Ada Lovelace", organisation: "Analytical Engines Ltd", stage: "OPPORTUNITY (Qualified)", origin: "website", qualifiedBy: "Created in the Developer Pipeline: qualified on arrival" })], [enquiry({ id: "d1", kind: "deal" })], kpiConfig, ["2026-10"]);
    const rows = qualifiedCsvRows(list);
    expect(Object.keys(rows[0]!)).toEqual(["Name", "Company", "Pipeline", "Qualified on", "Received on", "Channel", "Inbound", "Why it counts", "How it came in", "Source", "Campaign", "Stage", "Status", "Pipedrive id"]);
    expect(rows[0]).toMatchObject({ Name: "Ada Lovelace", Company: "Analytical Engines Ltd", Inbound: "Yes", Channel: "Website", "How it came in": "Website: contact form", "Pipedrive id": "d1" });
  });
});
