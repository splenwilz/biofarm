import { monthRange } from "@/lib/kpi";
import type { AiAssistant, DashboardData, NewsletterIssue } from "@/lib/types";

export interface IssueRow extends NewsletterIssue {
  openRate: number;
  clickRate: number;
}

export interface NewsletterReport {
  subscribers: number;
  subscribersPrev: number;
  /** Subscribers in the same month a year earlier; null when the data does not reach back that far. */
  subscribersLastYear: number | null;
  subscribersByMonth: number[];
  netAddsByMonth: number[];
  /** People who joined and who left in each month of the window, oldest first. */
  addedByMonth: number[];
  removedByMonth: number[];
  /** People who joined and left over the whole window. */
  added: number;
  removed: number;
  /** Unsubscribes ÷ recipients across the window's issues. */
  unsubscribeRate: number | null;
  /** Issues sent inside the window, newest first. */
  issues: IssueRow[];
  lastIssue: IssueRow | null;
  previousIssue: IssueRow | null;
  avgOpenRate: number | null;
  avgClickRate: number | null;
  /** Newsletter sign-ups through the website, per month of the window and in total. */
  signupsByMonth: number[];
  signups: number;
}

function rate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

/** Newsletter figures for a 12-month window ending at the report month. */
export function newsletterReport(data: DashboardData["newsletter"], months: string[]): NewsletterReport {
  const byMonth = new Map(data.subscribers.map((s) => [s.month, s]));
  const last = months.length - 1;
  const subscribersByMonth = months.map((m) => byMonth.get(m)?.subscribers ?? 0);
  const addedByMonth = months.map((m) => byMonth.get(m)?.added ?? 0);
  const removedByMonth = months.map((m) => byMonth.get(m)?.removed ?? 0);
  const netAddsByMonth = months.map((_, i) => addedByMonth[i] - removedByMonth[i]);
  const issues: IssueRow[] = data.issues
    .filter((i) => months.includes(i.sentAt.slice(0, 7)))
    .map((i) => ({ ...i, openRate: rate(i.opens, i.recipients), clickRate: rate(i.clicks, i.recipients) }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const avg = (pick: (i: IssueRow) => number) => (issues.length ? issues.reduce((s, i) => s + pick(i), 0) / issues.length : null);
  const inWindow = months.map((m) => byMonth.get(m)).filter((s) => s !== undefined);
  const recipients = issues.reduce((s, i) => s + i.recipients, 0);
  const lastYear = byMonth.get(monthRange(months[last], 13)[0]);
  const signupsBy = new Map((data.signups ?? []).map((s) => [s.month, s.count]));
  const signupsByMonth = months.map((m) => signupsBy.get(m) ?? 0);
  return {
    signupsByMonth,
    signups: signupsByMonth.reduce((s, n) => s + n, 0),
    subscribers: subscribersByMonth[last],
    subscribersPrev: subscribersByMonth[last - 1],
    subscribersLastYear: lastYear ? lastYear.subscribers : null,
    subscribersByMonth,
    netAddsByMonth,
    addedByMonth,
    removedByMonth,
    added: inWindow.reduce((s, m) => s + m.added, 0),
    removed: inWindow.reduce((s, m) => s + m.removed, 0),
    unsubscribeRate: recipients ? issues.reduce((s, i) => s + i.unsubscribes, 0) / recipients : null,
    issues,
    lastIssue: issues[0] ?? null,
    previousIssue: issues[1] ?? null,
    avgOpenRate: avg((i) => i.openRate),
    avgClickRate: avg((i) => i.clickRate),
  };
}

export interface AssistantRow {
  assistant: AiAssistant;
  sessions: number;
  share: number;
}

export interface SearchReport {
  brandImpressions: number;
  brandImpressionsPrev: number;
  brandByMonth: number[];
  brandClicks: number;
  aiSessions: number;
  aiSessionsPrev: number;
  aiByMonth: number[];
  aiMentionShare: number | null;
  aiMentionSharePrev: number | null;
  /** The report month's AI referrals by assistant, largest first. */
  assistants: AssistantRow[];
}

/** Brand search and AI visibility figures for a 12-month window ending at the report month. */
export function searchReport(data: DashboardData["search"], months: string[]): SearchReport {
  const byMonth = new Map(data.months.map((m) => [m.month, m]));
  const last = months.length - 1;
  const row = (m: string) => byMonth.get(m);
  const brandByMonth = months.map((m) => row(m)?.brandImpressions ?? 0);
  const aiByMonth = months.map((m) => row(m)?.aiSessions ?? 0);
  const totals = new Map<AiAssistant, number>();
  for (const r of data.aiReferrals) {
    if (r.month === months[last]) totals.set(r.assistant, (totals.get(r.assistant) ?? 0) + r.sessions);
  }
  const total = [...totals.values()].reduce((s, v) => s + v, 0);
  const assistants: AssistantRow[] = [...totals.entries()]
    .map(([assistant, sessions]) => ({ assistant, sessions, share: total ? sessions / total : 0 }))
    .sort((a, b) => b.sessions - a.sessions);
  return {
    brandImpressions: brandByMonth[last],
    brandImpressionsPrev: brandByMonth[last - 1],
    brandByMonth,
    brandClicks: row(months[last])?.brandClicks ?? 0,
    aiSessions: aiByMonth[last],
    aiSessionsPrev: aiByMonth[last - 1],
    aiByMonth,
    aiMentionShare: row(months[last])?.aiMentionShare ?? null,
    aiMentionSharePrev: row(months[last - 1])?.aiMentionShare ?? null,
    assistants,
  };
}
