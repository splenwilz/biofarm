import { describe, expect, it } from "vitest";

import { kpiConfig } from "@/config/kpi";
import { buildDemoData, DEMO_LAST_MONTH, DEMO_MONTHS, DEMO_TODAY } from "@/data/demo";
import { monthRange, qualifiedByMonth } from "@/lib/kpi";

describe("demo data", () => {
  const data = buildDemoData();
  const months = monthRange(DEMO_LAST_MONTH, DEMO_MONTHS);

  it("covers two years", () => {
    expect(DEMO_MONTHS).toBe(24);
    expect(months[0]).toBe("2024-11");
  });

  it("is deterministic", () => {
    expect(buildDemoData()).toEqual(data);
    expect(buildDemoData(7)).not.toEqual(data);
  });

  it("is labelled as demo and dated", () => {
    expect(data.source).toBe("demo");
    expect(data.syncedAt).toBe(DEMO_TODAY);
  });

  it("has volumes in the range the real account showed", () => {
    const rows = qualifiedByMonth(data.deals, months, kpiConfig);
    for (const row of rows) {
      expect(row.inbound, row.month).toBeGreaterThanOrEqual(4);
      expect(row.inbound, row.month).toBeLessThanOrEqual(18);
      expect(row.network, row.month).toBeGreaterThanOrEqual(4);
    }
    const perMonth = months.map((m) => data.enquiries.filter((e) => e.createdAt.startsWith(m) && e.channel === "Website").length);
    expect(Math.min(...perMonth)).toBeGreaterThanOrEqual(14); // a fifth of form submissions are newsletter sign-ups, which are not enquiries
    expect(Math.max(...perMonth)).toBeLessThanOrEqual(32);
    const teamPerMonth = months.map((m) => data.enquiries.filter((e) => e.createdAt.startsWith(m) && e.channel !== "Website").length);
    expect(Math.min(...teamPerMonth)).toBeGreaterThanOrEqual(8);
  });

  it("gives every enquiry a kind and a channel, keeps newsletter sign-ups out of enquiries and reports them by month", () => {
    expect(data.enquiries.every((e) => (e.kind === "lead" || e.kind === "deal") && typeof e.archived === "boolean")).toBe(true);
    expect(data.enquiries.some((e) => e.channel === "Campaigns / Outreach" && e.form === null && e.sourceLabel === null && e.landingPage === null)).toBe(true);
    expect(data.enquiries.some((e) => e.form === "newsletter")).toBe(false);
    expect(data.newsletter.signups.length).toBeGreaterThan(0);
    expect(data.newsletter.signups.every((s) => /^\d{4}-\d{2}$/.test(s.month) && s.count > 0)).toBe(true);
  });

  it("links some enquiries to qualified deals through the person id", () => {
    const people = new Set(data.enquiries.map((e) => e.personId));
    const linked = data.deals.filter((d) => d.personId !== null && people.has(d.personId));
    expect(linked.length).toBeGreaterThan(30);
    for (const d of linked) {
      const e = data.enquiries.find((x) => x.personId === d.personId)!;
      expect(d.qualifiedAt! >= e.createdAt).toBe(true);
      expect(d.channel).toBe("Website");
      expect(d.sourceLabel).toBe(e.sourceLabel);
    }
  });

  it("follows the pipeline rules for qualifiedAt", () => {
    for (const d of data.deals) {
      if (d.pipeline === "developer") expect(d.qualifiedAt).toBe(d.createdAt);
      if (d.qualifiedAt) expect(d.qualifiedAt <= DEMO_TODAY).toBe(true);
    }
    expect(data.deals.some((d) => d.pipeline === "landowner" && d.qualifiedAt === null)).toBe(true);
  });

  it("has spend for every month and nothing dated outside the window", () => {
    for (const m of months) expect(data.spend.some((s) => s.month === m)).toBe(true);
    expect(data.spend.every((s) => months.includes(s.month))).toBe(true);
    expect(data.spend.every((s) => s.amountGbp > 0)).toBe(true);
  });

  it("ends the newsletter at the real subscriber count with one issue a month", () => {
    const last = data.newsletter.subscribers[data.newsletter.subscribers.length - 1];
    expect(last.month).toBe(DEMO_LAST_MONTH);
    expect(last.subscribers).toBe(933);
    expect(data.newsletter.issues.map((i) => i.sentAt.slice(0, 7))).toEqual(months);
    for (const i of data.newsletter.issues) {
      expect(i.opens).toBeLessThanOrEqual(i.recipients);
      expect(i.clicks).toBeLessThanOrEqual(i.opens);
    }
  });

  it("has search rows for every month whose AI referrals add up", () => {
    expect(data.search.months.map((m) => m.month)).toEqual(months);
    for (const m of data.search.months) {
      const sessions = data.search.aiReferrals.filter((r) => r.month === m.month).reduce((s, r) => s + r.sessions, 0);
      expect(sessions).toBe(m.aiSessions);
      expect(m.brandClicks).toBeLessThanOrEqual(m.brandImpressions);
    }
    expect(data.search.months.find((m) => m.month === "2026-06")!.aiMentionShare).toBeNull();
    expect(data.search.months.find((m) => m.month === DEMO_LAST_MONTH)!.aiMentionShare).not.toBeNull();
  });

  it("gives developer deals a result for each draft check, and some fail one, so the switches do something", () => {
    const developer = data.deals.filter((d) => d.pipeline === "developer");
    expect(developer.length).toBeGreaterThan(0);
    for (const d of developer) {
      expect(Object.keys(d.checks ?? {}).sort()).toEqual(["buyer", "habitat", "project", "serve", "timing"]);
    }
    expect(developer.some((d) => Object.values(d.checks!).includes(false))).toBe(true);
    expect(developer.filter((d) => Object.values(d.checks!).every(Boolean)).length).toBeGreaterThan(developer.length / 3);
    for (const d of data.deals.filter((d) => d.pipeline === "landowner")) expect(d.checks).toBeUndefined();
  });

  it("switching every check on lowers the qualified count for the latest month", () => {
    const allOn = { ...kpiConfig, qualificationChecks: { buyer: true, project: true, serve: true, habitat: true, timing: true } };
    const before = qualifiedByMonth(data.deals, [DEMO_LAST_MONTH], kpiConfig)[0].inbound;
    const after = qualifiedByMonth(data.deals, [DEMO_LAST_MONTH], allOn)[0].inbound;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });
});
