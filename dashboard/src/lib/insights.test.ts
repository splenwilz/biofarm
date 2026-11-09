import { describe, expect, it } from "vitest";

import { kpiConfig } from "@/config/kpi";
import { buildDemoData, DEMO_LAST_MONTH, DEMO_TODAY } from "@/data/demo";
import { ALERT_RULES, buildAlerts, campaignSummary, campaignTable, dataQuality, enquiriesByForm, eventsReport, landingPages, outcomesBySource, sessionsChange, speedToLead, summaryText, trafficReport } from "@/lib/insights";
import { CHANNEL_NAMES } from "@/lib/channelNames";
import { monthRange } from "@/lib/kpi";
import { buildReport } from "@/lib/report";
import type { Deal, Enquiry } from "@/lib/types";

const data = buildDemoData();
const months = monthRange(DEMO_LAST_MONTH, 12);
const report = buildReport(data, data.spend, kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY);

describe("campaignTable", () => {
  const rows = campaignTable(data.enquiries, data.deals, data.spend, report.trailingMonths, kpiConfig);

  it("joins spend, enquiries and qualified opportunities by campaign name, biggest spend first", () => {
    const search = rows.find((r) => r.campaign === "AWD - MOF - Search - Biofarm")!;
    expect(search.spendGbp).toBeGreaterThan(0);
    expect(search.enquiries).toBeGreaterThan(0);
    expect(search.costPerEnquiry).toBeCloseTo(search.spendGbp / search.enquiries, 6);
    expect(search.cpqo).toBe(search.qualified ? Math.round((search.spendGbp / search.qualified) * 100) / 100 : null);
    const spends = rows.filter((r) => r.spendGbp > 0).map((r) => r.spendGbp);
    expect(spends).toEqual([...spends].sort((a, b) => b - a));
  });

  it("keeps untagged enquiries visible as their own row, after the campaigns", () => {
    const last = rows[rows.length - 1];
    expect(last.campaign).toBe("Untracked");
    expect(last.spendGbp).toBe(0);
    expect(last.enquiries).toBeGreaterThan(0);
  });
});

describe("campaignSummary", () => {
  const rows = campaignTable(data.enquiries, data.deals, data.spend, report.trailingMonths, kpiConfig);
  const total = data.enquiries.filter((e) => report.trailingMonths.includes(e.createdAt.slice(0, 7))).length;
  const summary = campaignSummary(rows, total, 1);

  it("totals spend, tagged enquiries and qualified across campaigns", () => {
    expect(summary.spendGbp).toBeCloseTo(rows.reduce((s, r) => s + r.spendGbp, 0), 6);
    expect(summary.paidCampaigns).toBe(rows.filter((r) => r.spendGbp > 0).length);
    const tagged = rows.filter((r) => r.campaign !== "Untracked");
    expect(summary.taggedEnquiries).toBe(tagged.reduce((s, r) => s + r.enquiries, 0));
    expect(summary.taggedShare).toBeCloseTo(summary.taggedEnquiries / total, 9);
    expect(summary.qualified).toBe(tagged.reduce((s, r) => s + r.qualified, 0));
  });

  it("divides paid spend by the qualified opportunities those campaigns produced, and names the cheapest", () => {
    const paid = rows.filter((r) => r.spendGbp > 0);
    const paidQualified = paid.reduce((s, r) => s + r.qualified, 0);
    expect(summary.paidQualified).toBe(paidQualified);
    expect(summary.cpqo).toBeCloseTo(summary.spendGbp / paidQualified, 6);
    const cheapest = paid.filter((r) => r.cpqo !== null).sort((a, b) => a.cpqo! - b.cpqo!)[0];
    expect(summary.bestValue?.campaign).toBe(cheapest.campaign);
  });

  it("names the best value only among campaigns with the minimum qualified, so one lucky deal cannot win", () => {
    const mk = (campaign: string, spendGbp: number, qualified: number) => ({ campaign, spendGbp, enquiries: qualified * 2, costPerEnquiry: spendGbp / (qualified * 2), qualified, cpqo: spendGbp / qualified });
    const rows = [mk("Lucky", 100, 1), mk("Steady", 900, 3), mk("Big", 2000, 4)];
    expect(campaignSummary(rows, 20, 3).bestValue?.campaign).toBe("Steady");
    expect(campaignSummary(rows, 20, 1).bestValue?.campaign).toBe("Lucky");
    expect(campaignSummary(rows, 20, 5).bestValue).toBeNull();
  });

  it("copes with no spend and no enquiries", () => {
    const empty = campaignSummary([], 0, 3);
    expect(empty).toEqual({ spendGbp: 0, paidCampaigns: 0, taggedEnquiries: 0, taggedShare: null, qualified: 0, paidQualified: 0, cpqo: null, bestValue: null });
  });
});

describe("landingPages and enquiriesByForm", () => {
  it("counts enquiries and qualified opportunities per landing page, most enquiries first", () => {
    const rows = landingPages(data.enquiries, data.deals, report.trailingMonths, kpiConfig);
    expect(rows[0].enquiries).toBeGreaterThanOrEqual(rows[rows.length - 1].enquiries);
    expect(rows.reduce((s, r) => s + r.enquiries, 0)).toBe(data.enquiries.filter((e) => report.trailingMonths.includes(e.createdAt.slice(0, 7))).length);
    expect(rows.find((r) => r.page === "/cpd")).toBeDefined();
  });

  it("counts enquiries per form with readable labels, the team's own Pipedrive records last", () => {
    const inbound = data.enquiries.filter((e) => e.channel !== null && kpiConfig.inboundChannels.includes(e.channel));
    const rows = enquiriesByForm(inbound, [DEMO_LAST_MONTH]);
    expect(rows.map((r) => r.form)).toEqual(["contact", "landowner", "cpd", "fold", "none"]);
    expect(rows.find((r) => r.form === "cpd")!.label).toBe("CPD booking");
    expect(rows.find((r) => r.form === "none")!.label).toBe("Logged in Pipedrive by the team");
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(report.headline.enquiries);
  });

  it("landing pages: a deal created directly counts on its row but not in the row's conversion", () => {
    const list: Enquiry[] = [
      { id: "l1", createdAt: `${DEMO_LAST_MONTH}-02T09:00:00Z`, kind: "lead", form: "contact", audience: "developer", channel: "Website", sourceLabel: "direct", campaign: null, landingPage: "/x", firstContactAt: null, personId: 1, archived: false, converted: false },
      { id: "l2", createdAt: `${DEMO_LAST_MONTH}-03T09:00:00Z`, kind: "lead", form: "contact", audience: "developer", channel: "Website", sourceLabel: "direct", campaign: null, landingPage: "/x", firstContactAt: null, personId: 2, archived: false, converted: false },
      { id: "9", createdAt: `${DEMO_LAST_MONTH}-04T09:00:00Z`, kind: "deal", form: null, audience: "developer", channel: "Website", sourceLabel: null, campaign: null, landingPage: null, firstContactAt: null, personId: 3, archived: false, converted: false },
    ];
    const qualified: Deal[] = [
      { id: "q1", pipeline: "developer", channel: "Website", createdAt: `${DEMO_LAST_MONTH}-05T09:00:00Z`, qualifiedAt: `${DEMO_LAST_MONTH}-05T09:00:00Z`, status: "open", sourceLabel: null, campaign: null, personId: 1 },
      { id: "9", pipeline: "developer", channel: "Website", createdAt: `${DEMO_LAST_MONTH}-04T09:00:00Z`, qualifiedAt: `${DEMO_LAST_MONTH}-04T09:00:00Z`, status: "open", sourceLabel: null, campaign: null, personId: 3 },
    ];
    const rows = landingPages(list, qualified, [DEMO_LAST_MONTH], kpiConfig);
    const x = rows.find((r) => r.page === "/x")!;
    expect([x.enquiries, x.conversionBase, x.qualified, x.conversion]).toEqual([2, 2, 1, 0.5]);
    const none = rows.find((r) => r.page === "No landing page recorded")!;
    expect([none.enquiries, none.conversionBase, none.qualified, none.conversion]).toEqual([1, 0, 1, null]);
  });

  it("landing pages: records with no page recorded sit on one labelled row", () => {
    const rows = landingPages(data.enquiries, data.deals, report.trailingMonths, kpiConfig);
    expect(rows.find((r) => r.page === "No landing page recorded")).toBeDefined();
    expect(rows.some((r) => r.page === "null" || r.page === "")).toBe(false);
  });
});

describe("outcomesBySource", () => {
  it("lists every source group, busiest first, even those with no qualified opportunities", () => {
    const rows = outcomesBySource(data.deals, months, kpiConfig);
    expect(rows).toHaveLength(11);
    expect(new Set(rows.map((r) => r.group))).toEqual(new Set(["Paid search", "Organic search", "LinkedIn ads", "LinkedIn posts", "Newsletter", "Referral", "Events", "Website (source not tracked)", "Info email inbox", "Marketplace", "Direct/unknown"]));
    for (let i = 1; i < rows.length; i += 1) {
      const total = (r: (typeof rows)[number]) => r.won + r.open + r.lost;
      expect(total(rows[i - 1])).toBeGreaterThanOrEqual(total(rows[i]));
    }
    const empty = outcomesBySource([], months, kpiConfig);
    expect(empty).toHaveLength(11);
    expect(empty.every((r) => r.won + r.open + r.lost === 0)).toBe(true);
  });

  it("splits marketing's qualified opportunities by source into won, open and lost", () => {
    const rows = outcomesBySource(data.deals, months, kpiConfig);
    const total = rows.reduce((s, r) => s + r.won + r.open + r.lost, 0);
    expect(total).toBe(report.trend.reduce((s, r) => s + r.inbound, 0));
    expect(rows.find((r) => (r.group as string) === "Network")).toBeUndefined();
  });
});

describe("trafficReport", () => {
  const t = trafficReport(data.traffic, months, report.enquiriesByMonth);

  it("totals sessions per month and splits the report month by channel, largest first", () => {
    expect(t.sessionsByMonth).toHaveLength(12);
    expect(t.sessions).toBe(data.traffic.filter((r) => r.month === DEMO_LAST_MONTH).reduce((s, r) => s + r.sessions, 0));
    expect(t.channels[0].sessions).toBeGreaterThanOrEqual(t.channels[1].sessions);
    expect(t.channels.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
  });

  it("gives each channel its previous month and a 12-month series, plus the paid share and last year's total", () => {
    const organic = t.channels.find((c) => c.channel === "Organic search")!;
    const prevMonth = months[months.length - 2];
    expect(organic.sessionsPrev).toBe(data.traffic.find((r) => r.month === prevMonth && r.channel === "Organic search")!.sessions);
    expect(organic.byMonth).toHaveLength(12);
    expect(organic.byMonth[11]).toBe(organic.sessions);
    const paid = t.channels.filter((c) => c.channel === "Paid search" || c.channel === "Paid social").reduce((s, c) => s + c.sessions, 0);
    expect(t.paidShare).toBeCloseTo(paid / t.sessions, 9);
    const lastYear = monthRange(DEMO_LAST_MONTH, 13)[0];
    expect(t.sessionsLastYear).toBe(data.traffic.filter((r) => r.month === lastYear).reduce((s, r) => s + r.sessions, 0));
  });

  it("names each channel as the Sources page does", () => {
    expect(t.channels.find((c) => c.channel === "Paid social")!.name).toBe("LinkedIn ads");
    expect(t.channels.find((c) => c.channel === "AI assistant")!.name).toBe("AI search");
    expect(t.channels.find((c) => c.channel === "Direct")!.name).toBe("Direct/unknown");
  });

  it("has no last-year figure when the data does not reach back that far", () => {
    const short = trafficReport(data.traffic.filter((r) => months.includes(r.month)), months, report.enquiriesByMonth);
    expect(short.sessionsLastYear).toBeNull();
  });

  it("gives the enquiry conversion rate per session", () => {
    expect(t.conversion).toBeCloseTo(report.headline.enquiries / t.sessions, 9);
    expect(t.conversionPrev).toBeCloseTo(report.headline.enquiriesPrev / t.sessionsPrev, 9);
  });
});

describe("eventsReport and speedToLead", () => {
  it("lists the window's events newest first with totals", () => {
    const e = eventsReport(data.events, months);
    expect(e.events.length).toBeGreaterThan(0);
    expect(e.events.every((x) => months.includes(x.date.slice(0, 7)))).toBe(true);
    for (let i = 1; i < e.events.length; i += 1) expect(e.events[i - 1].date >= e.events[i].date).toBe(true);
    expect(e.totals.leads).toBe(e.events.reduce((s, x) => s + x.leads, 0));
  });

  it("costs events only where a cost was entered, and divides by the qualified enquiries from those events", () => {
    const e = eventsReport(data.events, months);
    const costed = e.events.filter((x) => x.costGbp !== null && x.costGbp !== undefined);
    expect(costed.length).toBeGreaterThan(0);
    expect(costed.length).toBeLessThan(e.events.length);
    expect(e.totals.costedEvents).toBe(costed.length);
    expect(e.totals.costGbp).toBe(costed.reduce((s, x) => s + (x.costGbp ?? 0), 0));
    expect(e.totals.qualifiedCosted).toBe(costed.reduce((s, x) => s + x.qualified, 0));
    expect(e.cpqo).toBeCloseTo(e.totals.costGbp / e.totals.qualifiedCosted, 6);
  });

  it("has no cost per qualified when no event has a cost, or when the costed events have no qualified enquiries yet", () => {
    const none = eventsReport(data.events.map((x) => ({ ...x, costGbp: null })), months);
    expect(none.totals.costedEvents).toBe(0);
    expect(none.totals.costGbp).toBe(0);
    expect(none.cpqo).toBeNull();
    const unripe = eventsReport(data.events.map((x) => ({ ...x, costGbp: 100, qualified: 0 })), months);
    expect(unripe.totals.costGbp).toBeGreaterThan(0);
    expect(unripe.cpqo).toBeNull();
  });

  it("marks events younger than the cohort maturity window as maturing and prices each event's qualified enquiries", () => {
    const e = eventsReport(data.events, months, { maturityDays: kpiConfig.cohortMaturityDays, today: DEMO_TODAY });
    const recent = e.events.find((x) => x.date.startsWith("2026-09-23"))!;
    const older = e.events.find((x) => x.date.startsWith("2026-03-04"))!;
    expect(recent.mature).toBe(false);
    expect(older.mature).toBe(true);
    expect(older.cpqo).toBeCloseTo(older.costGbp! / older.qualified, 6);
    const uncosted = e.events.find((x) => x.costGbp === null)!;
    expect(uncosted.cpqo).toBeNull();
    const unripe = eventsReport(data.events.map((x) => ({ ...x, costGbp: 100, qualified: 0 })), months);
    expect(unripe.events.every((x) => x.cpqo === null && x.mature)).toBe(true);
  });

  it("measures hours to first contact for the month's enquiries", () => {
    const s = speedToLead(data.enquiries, [DEMO_LAST_MONTH]);
    expect(s.measured).toBeGreaterThan(0);
    expect(s.medianHours).toBeGreaterThan(0);
    expect(s.within24h).toBeGreaterThan(0);
    expect(s.within24h).toBeLessThanOrEqual(1);
    expect(speedToLead([], [DEMO_LAST_MONTH]).medianHours).toBeNull();
  });
});

describe("dataQuality and alerts", () => {
  const q = dataQuality(data, data.spend, months);

  it("counts the gaps that distort the numbers", () => {
    expect(q.dealsNoChannel.total).toBeGreaterThan(0);
    expect(q.dealsNoChannel.count).toBe(data.deals.filter((d) => months.includes(d.createdAt.slice(0, 7)) && d.channel === null).length);
    expect(q.websiteDealsNoLabel.count).toBe(data.deals.filter((d) => months.includes(d.createdAt.slice(0, 7)) && d.channel === "Website" && !d.sourceLabel).length);
    expect(q.enquiriesNoContact.count).toBeGreaterThan(0);
    expect(q.monthsNoSpend).toEqual([]);
  });

  it("groups alerts into data and performance and keeps the rules that stayed", () => {
    const alerts = buildAlerts({ report, quality: q, config: kpiConfig, now: DEMO_TODAY });
    expect(alerts.every((a) => a.group === "data" || a.group === "performance")).toBe(true);
    expect(alerts.some((a) => a.id === "below-target")).toBe(report.headline.qualified < kpiConfig.targetQualifiedPerMonth * 0.75);
    expect(alerts.find((a) => a.id === "deals-no-channel")?.group).toBe(q.dealsNoChannel.share > 0.03 ? "data" : undefined);
    expect(alerts.some((a) => a.id === "enquiries-no-contact")).toBe(false);
    expect(alerts.some((a) => a.id === "sync-stale")).toBe(false);
    const noSpend = buildAlerts({ report: buildReport(data, [], kpiConfig, { audience: "all", month: DEMO_LAST_MONTH, window: 3 }, DEMO_TODAY), quality: dataQuality(data, [], months), config: kpiConfig, now: DEMO_TODAY });
    expect(noSpend.find((a) => a.id === "spend-missing")).toMatchObject({ severity: "warning", group: "data" });
  });

  it("flags no new data from Pipedrive after two days, since the feed is webhooks rather than a nightly sync", () => {
    const fresh = buildAlerts({ report, quality: q, config: kpiConfig, now: "2026-11-02T18:00:00Z" });
    expect(fresh.some((a) => a.id === "pipedrive-stale")).toBe(false);
    const stale = buildAlerts({ report, quality: q, config: kpiConfig, now: "2026-11-04T09:00:00Z" });
    const alert = stale.find((a) => a.id === "pipedrive-stale")!;
    expect(alert).toMatchObject({ severity: "critical", group: "data", title: "No new data from Pipedrive for 2 days" });
    expect(alert.detail).not.toMatch(/nightly/i);
  });

  it("compares cost per qualified with the trailing three-month average, not the month before", () => {
    const h = report.headline;
    const jumped = buildAlerts({ report: { ...report, headline: { ...h, cpqoMonth: 1000, cpqoTrailing: 700, cpqoPrev: 2000 } }, quality: q, config: kpiConfig, now: DEMO_TODAY });
    const alert = jumped.find((a) => a.id === "cpqo-up")!;
    expect(alert).toMatchObject({ group: "performance", severity: "warning" });
    expect(alert.detail).toMatch(/£700/);
    expect(alert.detail).toMatch(/3-month average/i);
    const steady = buildAlerts({ report: { ...report, headline: { ...h, cpqoMonth: 1000, cpqoTrailing: 950, cpqoPrev: 400 } }, quality: q, config: kpiConfig, now: DEMO_TODAY });
    expect(steady.some((a) => a.id === "cpqo-up")).toBe(false);
  });

  it("flags a paid platform that spent in the month without a qualified enquiry", () => {
    const withSpend = buildAlerts({
      report: { ...report, spendByPlatformMonth: [{ platform: "google_ads", label: "Google Ads", amountGbp: 1200, share: 1, qualified: 0, cpqo: null }] },
      quality: q,
      config: kpiConfig,
      now: DEMO_TODAY,
    });
    const alert = withSpend.find((a) => a.id === "paid-no-qualified-google_ads")!;
    expect(alert).toMatchObject({ group: "performance", severity: "warning" });
    expect(alert.title).toMatch(/Google Ads/);
    const productive = buildAlerts({ report: { ...report, spendByPlatformMonth: [{ platform: "google_ads", label: "Google Ads", amountGbp: 1200, share: 1, qualified: 2, cpqo: 600 }] }, quality: q, config: kpiConfig, now: DEMO_TODAY });
    expect(productive.some((a) => a.id.startsWith("paid-no-qualified"))).toBe(false);
  });

  it("lists the qualification-status rule but keeps it switched off until Pipedrive has the field", () => {
    const rule = ALERT_RULES.find((r) => r.id === "deals-no-qualification")!;
    expect(rule).toMatchObject({ group: "data", enabled: false });
    expect(rule.note).toMatch(/until the field exists in Pipedrive/i);
    const old = { ...data.deals[0], id: "deal-old", createdAt: "2026-09-01T09:00:00Z", qualificationStatus: null };
    const off = buildAlerts({ report, quality: dataQuality({ ...data, deals: [...data.deals, old] }, data.spend, months), config: kpiConfig, now: DEMO_TODAY });
    expect(off.some((a) => a.id === "deals-no-qualification")).toBe(false);
    const on = buildAlerts({ report, quality: dataQuality({ ...data, deals: [...data.deals, old] }, data.spend, months), config: { ...kpiConfig, qualificationStatusInPipedrive: true }, now: DEMO_TODAY });
    expect(on.find((a) => a.id === "deals-no-qualification")).toMatchObject({ group: "data" });
    expect(ALERT_RULES.some((r) => /no reply logged/i.test(r.title))).toBe(false);
  });

  it("writes the month in plain words for the meeting note", () => {
    const text = summaryText(report, kpiConfig);
    const lines = text.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines[0]).toBe("Marketing, Oct 2026");
    expect(lines[1]).toMatch(new RegExp(`^Qualified opportunities: ${report.headline.qualified}, [-+]\\d+ vs Sep 2026\\. Target ${kpiConfig.targetQualifiedPerMonth}, 3-month average [\\d.]+\\.$`));
    expect(lines[2]).toMatch(/^Cost per qualified: £[\d,]+ this month, £[\d,]+ over 3 months, on £[\d,]+ spend\.$/);
    expect(lines[3]).toMatch(/^Enquiries: \d+, [-+]\d+ vs Sep 2026\.$/);
    expect(lines[4]).toMatch(/^Top sources, Aug to Oct 2026: /);
    const names = new Set<string>(Object.values(CHANNEL_NAMES));
    for (const part of lines[4].replace(/^Top sources, Aug to Oct 2026: /, "").replace(/\.$/, "").split(", ")) {
      expect(names.has(part.replace(/ \d+$/, ""))).toBe(true);
    }
    if (lines[5]) expect(lines[5]).toMatch(/^Same month last year: \d+ qualified, \d+ enquiries\.$/);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(110);
  });
});

describe("sessionsChange", () => {
  it("is the month-on-month change as a signed percentage", () => {
    expect(sessionsChange(120, 100, 50)).toBe("+20%");
    expect(sessionsChange(80, 100, 50)).toBe("−20%");
    expect(sessionsChange(100, 100, 50)).toBe("±0%");
  });

  it("says new when there was nothing the month before, and nothing at all when both are empty", () => {
    expect(sessionsChange(60, 0, 50)).toBe("new");
    expect(sessionsChange(0, 0, 50)).toBe("–");
  });

  it("shows a dash for channels under the minimum sessions this month", () => {
    expect(sessionsChange(49, 100, 50)).toBe("–");
    expect(sessionsChange(50, 100, 50)).toBe("−50%");
    expect(sessionsChange(13, 0, 50)).toBe("–");
  });
});
