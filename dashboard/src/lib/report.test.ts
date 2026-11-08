import { describe, expect, it } from "vitest";

import { kpiConfig } from "@/config/kpi";
import { buildDemoData, DEMO_LAST_MONTH, DEMO_TODAY } from "@/data/demo";
import { monthRange, qualifiedByMonth } from "@/lib/kpi";
import { buildReport } from "@/lib/report";

const data = buildDemoData();

describe("buildReport", () => {
  it("builds a 12-month window ending at the report month", () => {
    const r = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    expect(r.months).toHaveLength(12);
    expect(r.months[11]).toBe(DEMO_LAST_MONTH);
    expect(r.trend).toHaveLength(12);
  });

  it("headline qualified count equals the last trend bar and the previous-month delta is consistent", () => {
    const r = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const expected = qualifiedByMonth(data.deals, monthRange(DEMO_LAST_MONTH, 12), kpiConfig);
    expect(r.headline.qualified).toBe(expected[11].inbound);
    expect(r.headline.qualifiedPrev).toBe(expected[10].inbound);
    expect(r.headline.qualified - r.headline.qualifiedPrev).toBe(r.headline.qualifiedDelta);
  });

  it("an audience filter narrows the headline but CPQO keeps the all-audience denominator", () => {
    const all = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const dev = buildReport(data, data.spend, kpiConfig, { audience: "developer", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const land = buildReport(data, data.spend, kpiConfig, { audience: "landowner", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    expect(dev.headline.qualified + land.headline.qualified).toBe(all.headline.qualified);
    expect(dev.headline.cpqoMonth).toBe(all.headline.cpqoMonth);
  });

  it("an earlier report month shifts the window", () => {
    const r = buildReport(data, data.spend, kpiConfig, { audience: "all", month: "2026-06", window: 3 }, DEMO_TODAY);
    expect(r.months[11]).toBe("2026-06");
    expect(r.headline.qualified).toBe(qualifiedByMonth(data.deals, ["2026-06"], kpiConfig)[0].inbound);
  });

  it("extra spend raises the month's cost per qualified opportunity", () => {
    const base = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const more = buildReport(
      data,
      [...data.spend, { id: "x", month: DEMO_LAST_MONTH, platform: "google_ads", campaign: "Extra", amountGbp: 5000 }],
      kpiConfig,
      { audience: "all", month: DEMO_LAST_MONTH, window: 3 },
      DEMO_TODAY,
    );
    expect(more.headline.spendMonth).toBe(base.headline.spendMonth + 5000);
    expect((more.headline.cpqoMonth ?? 0) > (base.headline.cpqoMonth ?? 0)).toBe(true);
  });
});

describe("buildReport window", () => {
  it("sizes the breakdown window from the filter but keeps the smoothed headline figures on the config", () => {
    const three = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const twelve = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 12 }, DEMO_TODAY);
    const one = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 1 }, DEMO_TODAY);
    expect(three.trailingMonths).toHaveLength(3);
    expect(twelve.trailingMonths).toHaveLength(12);
    expect(one.trailingMonths).toEqual([DEMO_LAST_MONTH]);
    const total = (r: typeof three) => r.sources.reduce((s, x) => s + x.enquiries, 0);
    expect(total(twelve)).toBeGreaterThan(total(three));
    expect(total(three)).toBeGreaterThan(total(one));
    expect(twelve.headline.trailingAvg).toBe(three.headline.trailingAvg);
    expect(three.prevTrailingMonths).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(one.prevTrailingMonths).toEqual(["2026-09"]);
    expect(one.sourcesPrev.reduce((s, x) => s + x.enquiries, 0)).toBe(one.enquiriesByMonth[10]);
    expect(twelve.prevTrailingMonths[0]).toBe("2024-11");
    expect(twelve.headline.cpqoTrailing).toBe(three.headline.cpqoTrailing);
  });
});

describe("buildReport series for charts", () => {
  const r = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);

  it("counts inbound enquiries only, with outbound / network and unattributed alongside as context", () => {
    const r = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const inMonth = data.enquiries.filter((e) => e.createdAt.startsWith(DEMO_LAST_MONTH));
    const inbound = inMonth.filter((e) => e.channel !== null && kpiConfig.inboundChannels.includes(e.channel));
    const network = inMonth.filter((e) => e.channel !== null && kpiConfig.networkChannels.includes(e.channel));
    expect(inbound.length).toBeGreaterThan(0);
    expect(network.length).toBeGreaterThan(0);
    expect(r.headline.enquiries).toBe(inbound.length);
    expect(r.headline.enquiriesNetwork).toBe(network.length);
    expect(r.headline.enquiriesUnattributed).toBe(inMonth.length - inbound.length - network.length);
    expect(r.enquiriesByMonth[11]).toBe(inbound.length);
  });

  it("counts inbound enquiries with no known audience separately when one audience is selected, instead of dropping them silently", () => {
    const isInbound = (e: (typeof data.enquiries)[number]) => e.channel !== null && kpiConfig.inboundChannels.includes(e.channel);
    // a month in which some inbound enquiry has no known audience
    const month = monthRange(DEMO_LAST_MONTH, 12).find((m) => data.enquiries.some((e) => e.createdAt.startsWith(m) && e.audience === "other" && isInbound(e)))!;
    expect(month).toBeDefined();
    const all = buildReport(data, data.spend, kpiConfig, { audience: "all", month, window: 3 }, DEMO_TODAY);
    const dev = buildReport(data, data.spend, kpiConfig, { audience: "developer", month, window: 3 }, DEMO_TODAY);
    const land = buildReport(data, data.spend, kpiConfig, { audience: "landowner", month, window: 3 }, DEMO_TODAY);
    const unknown = data.enquiries.filter((e) => e.createdAt.startsWith(month) && e.audience === "other" && isInbound(e)).length;
    expect(unknown).toBeGreaterThan(0);
    expect(all.headline.enquiriesAudienceUnknown).toBe(0);
    expect(dev.headline.enquiriesAudienceUnknown).toBe(unknown);
    expect(land.headline.enquiriesAudienceUnknown).toBe(unknown);
    expect(dev.headline.enquiries + land.headline.enquiries + unknown).toBe(all.headline.enquiries);
  });

  it("exposes the inbound enquiries for the chosen audience, the list every page counts from", () => {
    const all = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    const dev = buildReport(data, data.spend, kpiConfig, { audience: "developer", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    expect(all.enquiries.every((e) => e.channel !== null && kpiConfig.inboundChannels.includes(e.channel))).toBe(true);
    expect(dev.enquiries.every((e) => e.audience === "developer")).toBe(true);
    expect(all.enquiries.filter((e) => e.createdAt.startsWith(DEMO_LAST_MONTH))).toHaveLength(all.headline.enquiries);
    expect(all.enquiries.length).toBeLessThan(data.enquiries.length);
  });

  it("gives enquiries per month for the window, matching the headline", () => {
    expect(r.enquiriesByMonth).toHaveLength(12);
    expect(r.enquiriesByMonth[11]).toBe(r.headline.enquiries);
    expect(r.enquiriesByMonth[10]).toBe(r.headline.enquiriesPrev);
  });

  it("gives cost per qualified opportunity per month, null where there was no spend or no opportunity", () => {
    expect(r.cpqoByMonth).toHaveLength(12);
    expect(r.cpqoByMonth[11]).toBe(r.headline.cpqoMonth);
    const noSpend = buildReport(data, [], kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);
    expect(noSpend.cpqoByMonth.every((v) => v === null)).toBe(true);
  });

  it("also keeps the report month's spend by platform for the alerts", () => {
    expect(r.spendByPlatformMonth.reduce((s, p) => s + p.amountGbp, 0)).toBe(r.headline.spendMonth);
    expect(r.spendByPlatformMonth.every((p) => p.amountGbp > 0)).toBe(true);
  });

  it("splits the window's spend by platform, largest first, with shares that sum to one", () => {
    const total = r.spendByPlatform.reduce((s, p) => s + p.amountGbp, 0);
    expect(total).toBeCloseTo(data.spend.filter((e) => r.trailingMonths.includes(e.month)).reduce((s, e) => s + e.amountGbp, 0), 6);
    const oneMonth = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 1 }, DEMO_TODAY);
    expect(oneMonth.spendByPlatform.reduce((s, p) => s + p.amountGbp, 0)).toBe(oneMonth.headline.spendMonth);
    expect(r.spendByPlatform.map((p) => p.amountGbp)).toEqual([...r.spendByPlatform.map((p) => p.amountGbp)].sort((a, b) => b - a));
    expect(r.spendByPlatform.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 6);
  });
});

describe("buildReport year-on-year and platform figures", () => {
  const r = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);

  it("gives the same month a year earlier when the data reaches back", () => {
    expect(r.headline.qualifiedLastYear).toBe(qualifiedByMonth(data.deals, ["2025-10"], kpiConfig)[0].inbound);
    expect(r.headline.enquiriesLastYear).toBe(data.enquiries.filter((e) => e.createdAt.startsWith("2025-10") && e.channel !== null && kpiConfig.inboundChannels.includes(e.channel)).length);
    expect(r.headline.cpqoLastYear).not.toBeNull();
  });

  it("returns null year-on-year figures when the data does not reach back", () => {
    const early = buildReport(data, data.spend, kpiConfig, { audience: "all", month: "2025-06", window: 3 }, DEMO_TODAY);
    expect(early.headline.qualifiedLastYear).toBeNull();
    expect(early.headline.cpqoLastYear).toBeNull();
  });

  it("attributes the window's qualified opportunities to the platform that paid for them", () => {
    const google = r.spendByPlatform.find((p) => p.platform === "google_ads")!;
    const expected = data.deals.filter((d) => d.qualifiedAt && r.trailingMonths.includes(d.qualifiedAt.slice(0, 7)) && d.sourceLabel === "google/cpc" && d.channel === "Website").length;
    expect(google.qualified).toBe(expected);
    if (expected) expect(google.cpqo).toBeCloseTo(google.amountGbp / expected, 6);
    else expect(google.cpqo).toBeNull();
  });
});
