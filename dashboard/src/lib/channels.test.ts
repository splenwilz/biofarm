import { describe, expect, it } from "vitest";

import { buildDemoData, DEMO_LAST_MONTH } from "@/data/demo";
import { newsletterReport, searchReport } from "@/lib/channels";
import { monthRange } from "@/lib/kpi";

const data = buildDemoData();
const months = monthRange(DEMO_LAST_MONTH, 12);

describe("newsletterReport", () => {
  const r = newsletterReport(data.newsletter, months);

  it("carries website sign-ups per month of the window, and their total", () => {
    expect(r.signupsByMonth).toHaveLength(months.length);
    expect(r.signups).toBe(r.signupsByMonth.reduce((s, n) => s + n, 0));
    expect(r.signups).toBeGreaterThan(0);
    expect(newsletterReport({ ...data.newsletter, signups: [{ month: months[0], count: 4 }] }, months).signupsByMonth[0]).toBe(4);
  });

  it("reports the subscriber count at the report month and the month before", () => {
    expect(r.subscribers).toBe(data.newsletter.subscribers.find((s) => s.month === DEMO_LAST_MONTH)!.subscribers);
    expect(r.subscribersPrev).toBe(data.newsletter.subscribers.find((s) => s.month === "2026-09")!.subscribers);
    expect(r.subscribersByMonth).toHaveLength(12);
    expect(r.subscribersByMonth[11]).toBe(r.subscribers);
  });

  it("lists the issues sent in the window, newest first, with open and click rates", () => {
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.every((i) => months.includes(i.sentAt.slice(0, 7)))).toBe(true);
    for (let i = 1; i < r.issues.length; i += 1) expect(r.issues[i - 1].sentAt >= r.issues[i].sentAt).toBe(true);
    const first = r.issues[0];
    expect(first.openRate).toBeCloseTo(first.opens / first.recipients, 6);
    expect(first.clickRate).toBeCloseTo(first.clicks / first.recipients, 6);
    expect(r.lastIssue).toEqual(first);
    expect(r.previousIssue).toEqual(r.issues[1]);
  });

  it("gives joined and left per month, with the net as their difference", () => {
    expect(r.addedByMonth).toHaveLength(12);
    expect(r.removedByMonth).toHaveLength(12);
    const sep = data.newsletter.subscribers.find((s) => s.month === "2026-09")!;
    expect(r.addedByMonth[10]).toBe(sep.added);
    expect(r.removedByMonth[10]).toBe(sep.removed);
    expect(r.netAddsByMonth).toEqual(r.addedByMonth.map((a, i) => a - r.removedByMonth[i]));
  });

  it("averages open and click rates over the window", () => {
    expect(r.avgOpenRate).toBeGreaterThan(0);
    expect(r.avgOpenRate).toBeLessThan(1);
    expect(r.avgClickRate).toBeLessThan(r.avgOpenRate!);
  });

  it("totals the window's joins and leaves and finds the count a year earlier", () => {
    const inWindow = data.newsletter.subscribers.filter((s) => months.includes(s.month));
    expect(r.added).toBe(inWindow.reduce((s, m) => s + m.added, 0));
    expect(r.removed).toBe(inWindow.reduce((s, m) => s + m.removed, 0));
    expect(r.subscribersLastYear).toBe(data.newsletter.subscribers.find((s) => s.month === monthRange(DEMO_LAST_MONTH, 13)[0])!.subscribers);
    expect(r.unsubscribeRate).toBeCloseTo(r.issues.reduce((s, i) => s + i.unsubscribes, 0) / r.issues.reduce((s, i) => s + i.recipients, 0), 9);
  });

  it("copes with an empty window", () => {
    const empty = newsletterReport({ issues: [], subscribers: [], signups: [] }, months);
    expect(empty.added).toBe(0);
    expect(empty.subscribersLastYear).toBeNull();
    expect(empty.unsubscribeRate).toBeNull();
    expect(empty.issues).toEqual([]);
    expect(empty.lastIssue).toBeNull();
    expect(empty.avgOpenRate).toBeNull();
    expect(empty.subscribers).toBe(0);
  });
});

describe("searchReport", () => {
  const r = searchReport(data.search, months);

  it("reports brand searches, AI sessions and mention share for the report month with the month before", () => {
    const last = data.search.months.find((m) => m.month === DEMO_LAST_MONTH)!;
    const prev = data.search.months.find((m) => m.month === "2026-09")!;
    expect(r.brandImpressions).toBe(last.brandImpressions);
    expect(r.brandImpressionsPrev).toBe(prev.brandImpressions);
    expect(r.aiSessions).toBe(last.aiSessions);
    expect(r.aiMentionShare).toBe(last.aiMentionShare);
    expect(r.brandByMonth).toHaveLength(12);
    expect(r.aiByMonth[11]).toBe(r.aiSessions);
  });

  it("splits the report month's AI referrals by assistant, largest first, summing to the month's sessions", () => {
    expect(r.assistants.map((a) => a.sessions)).toEqual([...r.assistants.map((a) => a.sessions)].sort((a, b) => b - a));
    expect(r.assistants.reduce((s, a) => s + a.sessions, 0)).toBe(r.aiSessions);
    expect(r.assistants.reduce((s, a) => s + a.share, 0)).toBeCloseTo(1, 6);
  });
});
