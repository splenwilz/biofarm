import type { KpiConfig } from "@/config/kpi";
import { gbp, integer, monthLabel, pct, windowLabel } from "@/lib/format";
import { cpqo, isDirectDeal, monthOf, monthRange, qualifiedInbound, SOURCE_GROUPS, sourceOf, type MonthlyQualified } from "@/lib/kpi";
import type { Report } from "@/lib/report";
import { channelName, type ChannelName } from "@/lib/channelNames";
import type { DashboardData, Deal, Enquiry, EnquiryForm, MarketingEvent, SourceGroup, SpendEntry, TrafficChannel, TrafficMonth } from "@/lib/types";

// ---- campaigns and pages ---------------------------------------------------------------

export interface CampaignRow {
  campaign: string;
  spendGbp: number;
  enquiries: number;
  qualified: number;
  costPerEnquiry: number | null;
  cpqo: number | null;
}

const UNTAGGED = "Untracked";

function norm(name: string | null): string | null {
  const n = name?.trim();
  return n ? n : null;
}

/**
 * Spend, enquiries and qualified opportunities per campaign over a window.
 * Spend lines and website records join on the campaign name as typed; the
 * row "Untracked" keeps untagged enquiries in view rather than hiding them.
 */
export function campaignTable(enquiries: Enquiry[], deals: Deal[], spend: SpendEntry[], months: string[], cfg: KpiConfig): CampaignRow[] {
  const rows = new Map<string, CampaignRow>();
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) {
      r = { campaign: name, spendGbp: 0, enquiries: 0, qualified: 0, costPerEnquiry: null, cpqo: null };
      rows.set(name, r);
    }
    return r;
  };
  for (const s of spend) if (months.includes(s.month)) row(norm(s.campaign) ?? UNTAGGED).spendGbp += s.amountGbp;
  for (const e of enquiries) if (months.includes(monthOf(e.createdAt))) row(norm(e.campaign) ?? UNTAGGED).enquiries += 1;
  for (const d of qualifiedInbound(deals, cfg)) {
    if (d.qualifiedAt && months.includes(monthOf(d.qualifiedAt)) && norm(d.campaign)) row(norm(d.campaign)!).qualified += 1;
  }
  for (const r of rows.values()) {
    r.spendGbp = Math.round(r.spendGbp * 100) / 100;
    r.costPerEnquiry = r.spendGbp > 0 && r.enquiries > 0 ? r.spendGbp / r.enquiries : null;
    r.cpqo = r.spendGbp > 0 ? cpqo(r.spendGbp, r.qualified) : null;
  }
  const untagged = rows.get(UNTAGGED);
  rows.delete(UNTAGGED);
  const sorted = [...rows.values()].sort((a, b) => b.spendGbp - a.spendGbp || b.enquiries - a.enquiries || a.campaign.localeCompare(b.campaign));
  return untagged ? [...sorted, untagged] : sorted;
}

export interface CampaignSummary {
  /** Spend across every campaign in the window. */
  spendGbp: number;
  /** Campaigns with any spend. */
  paidCampaigns: number;
  /** Enquiries that carried a campaign tag, and their share of all enquiries. */
  taggedEnquiries: number;
  taggedShare: number | null;
  /** Qualified opportunities attributed to a tagged campaign, and the subset from campaigns with spend. */
  qualified: number;
  paidQualified: number;
  /** Paid spend ÷ `paidQualified`. */
  cpqo: number | null;
  /** The campaign with the lowest cost per qualified, among those with spend and a qualified opportunity. */
  bestValue: CampaignRow | null;
}

/** The headline figures over a campaign table. `totalEnquiries` is every enquiry in the window, tagged or not. */
/** `minQualified`: a campaign needs this many qualified before it can be named best value. */
export function campaignSummary(rows: CampaignRow[], totalEnquiries: number, minQualified: number): CampaignSummary {
  const tagged = rows.filter((r) => r.campaign !== UNTAGGED);
  const paid = rows.filter((r) => r.spendGbp > 0);
  const spendGbp = Math.round(rows.reduce((s, r) => s + r.spendGbp, 0) * 100) / 100;
  const paidQualified = paid.reduce((s, r) => s + r.qualified, 0);
  const taggedEnquiries = tagged.reduce((s, r) => s + r.enquiries, 0);
  const bestValue = paid.filter((r) => r.cpqo !== null && r.qualified >= minQualified).sort((a, b) => (a.cpqo as number) - (b.cpqo as number))[0] ?? null;
  return {
    spendGbp,
    paidCampaigns: paid.length,
    taggedEnquiries,
    taggedShare: totalEnquiries ? taggedEnquiries / totalEnquiries : null,
    qualified: tagged.reduce((s, r) => s + r.qualified, 0),
    paidQualified,
    cpqo: spendGbp > 0 ? cpqo(spendGbp, paidQualified) : null,
    bestValue,
  };
}

export interface PageRow {
  page: string;
  enquiries: number;
  /** Enquiries the conversion is measured over: leads, not deals created directly. */
  conversionBase: number;
  qualified: number;
  conversion: number | null;
}

/** The row for enquiries with no landing page: the team's own Pipedrive records, and web-form leads whose page was not captured. */
export const NOT_WEBSITE = "No landing page recorded";

/** Enquiries and the qualified opportunities they became, by the page the enquiry was made on. */
export function landingPages(enquiries: Enquiry[], deals: Deal[], months: string[], cfg: KpiConfig): PageRow[] {
  const inWindow = enquiries.filter((e) => months.includes(monthOf(e.createdAt)));
  const qualifiedPeople = new Set(qualifiedInbound(deals, cfg).map((d) => d.personId).filter((p): p is number => p !== null));
  const rows = new Map<string, PageRow>();
  const fromLeads = new Map<string, number>(); // qualified among the base, per page
  for (const e of inWindow) {
    const page = e.landingPage ?? NOT_WEBSITE;
    let r = rows.get(page);
    if (!r) {
      r = { page, enquiries: 0, conversionBase: 0, qualified: 0, conversion: null };
      rows.set(page, r);
    }
    r.enquiries += 1;
    const qualified = e.personId !== null && qualifiedPeople.has(e.personId);
    if (qualified) r.qualified += 1;
    if (!isDirectDeal(e)) {
      r.conversionBase += 1;
      if (qualified) fromLeads.set(page, (fromLeads.get(page) ?? 0) + 1);
    }
  }
  for (const r of rows.values()) r.conversion = r.conversionBase ? (fromLeads.get(r.page) ?? 0) / r.conversionBase : null;
  return [...rows.values()].sort((a, b) => b.enquiries - a.enquiries || b.qualified - a.qualified || a.page.localeCompare(b.page));
}

/** How an enquiry arrived: a website form, or "none" for records the team logged in Pipedrive by hand. */
export type FormKey = EnquiryForm | "none";

export const FORM_LABEL: Record<FormKey, string> = {
  contact: "Contact form",
  landowner: "Landowner page form",
  newsletter: "Newsletter sign-up",
  cpd: "CPD booking",
  fold: "Fold enquiry",
  none: "Logged in Pipedrive by the team",
};

/** The rows of the by-form table, in order. Newsletter sign-ups are not enquiries, so they have no row. */
const FORM_ROWS: readonly FormKey[] = ["contact", "landowner", "cpd", "fold", "none"];

export interface FormRow {
  form: FormKey;
  label: string;
  count: number;
}

export function enquiriesByForm(enquiries: Enquiry[], months: string[]): FormRow[] {
  const counts = new Map<FormKey, number>();
  for (const e of enquiries) {
    if (!months.includes(monthOf(e.createdAt))) continue;
    const key: FormKey = e.form ?? "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return FORM_ROWS.map((form) => ({ form, label: FORM_LABEL[form], count: counts.get(form) ?? 0 }));
}

// ---- outcomes --------------------------------------------------------------------------

export interface OutcomeRow {
  group: SourceGroup;
  won: number;
  open: number;
  lost: number;
}

/** What became of marketing's qualified opportunities, by source group, over the window. Every group is listed, busiest first. */
export function outcomesBySource(deals: Deal[], months: string[], cfg: KpiConfig): OutcomeRow[] {
  const rows = new Map<SourceGroup, OutcomeRow>(SOURCE_GROUPS.map((group) => [group, { group, won: 0, open: 0, lost: 0 }]));
  for (const d of qualifiedInbound(deals, cfg)) {
    if (!d.qualifiedAt || !months.includes(monthOf(d.qualifiedAt))) continue;
    rows.get(sourceOf(d.sourceLabel, d.channel).group)![d.status] += 1;
  }
  const total = (r: OutcomeRow) => r.won + r.open + r.lost;
  return [...rows.values()].sort((a, b) => total(b) - total(a) || SOURCE_GROUPS.indexOf(a.group) - SOURCE_GROUPS.indexOf(b.group));
}

// ---- traffic ---------------------------------------------------------------------------

export interface ChannelRow {
  /** GA4's channel key. */
  channel: TrafficChannel;
  /** The shared channel name, as on the Sources page. */
  name: ChannelName;
  /** Sessions in the report month and the month before. */
  sessions: number;
  sessionsPrev: number;
  share: number;
  /** Sessions in each month of the window, oldest first. */
  byMonth: number[];
}

const PAID_CHANNELS: ReadonlySet<TrafficChannel> = new Set(["Paid search", "Paid social"]);

export interface TrafficReport {
  sessionsByMonth: number[];
  sessions: number;
  sessionsPrev: number;
  /** Sessions in the same month a year earlier; null when the data does not reach back that far. */
  sessionsLastYear: number | null;
  channels: ChannelRow[];
  /** Paid search and paid social as a share of the report month's sessions. */
  paidShare: number | null;
  /** Enquiries per session in the report month and the month before. */
  conversion: number | null;
  conversionPrev: number | null;
}

export function trafficReport(traffic: TrafficMonth[], months: string[], enquiriesByMonth: number[]): TrafficReport {
  const last = months.length - 1;
  const sessionsIn = (month: string, channel?: TrafficChannel) => traffic.filter((t) => t.month === month && (channel === undefined || t.channel === channel)).reduce((s, t) => s + t.sessions, 0);
  const sessionsByMonth = months.map((m) => sessionsIn(m));
  const total = sessionsByMonth[last];
  const channels = traffic
    .filter((t) => t.month === months[last])
    .map((t) => ({ channel: t.channel, name: channelName(t.channel), sessions: t.sessions, sessionsPrev: sessionsIn(months[last - 1], t.channel), share: total ? t.sessions / total : 0, byMonth: months.map((m) => sessionsIn(m, t.channel)) }))
    .sort((a, b) => b.sessions - a.sessions);
  const lastYear = monthRange(months[last], 13)[0];
  const paid = channels.filter((c) => PAID_CHANNELS.has(c.channel)).reduce((s, c) => s + c.sessions, 0);
  return {
    sessionsByMonth,
    sessions: total,
    sessionsPrev: sessionsByMonth[last - 1],
    sessionsLastYear: traffic.some((t) => t.month === lastYear) ? sessionsIn(lastYear) : null,
    channels,
    paidShare: total ? paid / total : null,
    conversion: total ? enquiriesByMonth[last] / total : null,
    conversionPrev: sessionsByMonth[last - 1] ? enquiriesByMonth[last - 1] / sessionsByMonth[last - 1] : null,
  };
}

/**
 * Month-on-month change in sessions as a signed percentage. "new" when there was nothing the
 * month before; "–" when both months are empty or the channel is under `minSessions` this
 * month, where a percentage would swing on a handful of visits.
 */
export function sessionsChange(now: number, before: number, minSessions: number): string {
  if (now < minSessions) return "–";
  if (before === 0) return now === 0 ? "–" : "new";
  const r = now / before - 1;
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${pct(Math.abs(r))}`;
}

// ---- events ----------------------------------------------------------------------------

export const EVENT_TYPE_LABEL: Record<MarketingEvent["type"], string> = {
  trade_show: "Trade show",
  cpd: "CPD session",
  webinar: "Webinar",
};

export interface EventRow extends MarketingEvent {
  /** false while the event is younger than the cohort maturity window, so a low qualified count is not read as failure yet. */
  mature: boolean;
  /** Cost ÷ qualified for this event; null without a cost or before anything qualified. */
  cpqo: number | null;
}

export interface EventsReport {
  events: EventRow[];
  totals: {
    events: number;
    attendees: number;
    leads: number;
    qualified: number;
    /** Events with a cost entered, what they cost, and the qualified enquiries they produced. */
    costedEvents: number;
    costGbp: number;
    qualifiedCosted: number;
  };
  /** Cost ÷ qualified across the events with a cost; null when there are none or none has qualified yet. */
  cpqo: number | null;
}

export function hasCost<T extends MarketingEvent>(e: T): e is T & { costGbp: number } {
  return typeof e.costGbp === "number";
}

/**
 * The window's events, newest first, with totals. `maturity` applies the cohort chart's rule:
 * an event is mature once `maturityDays` have passed since it, judged at `today`.
 */
export function eventsReport(events: MarketingEvent[], months: string[], maturity?: { maturityDays: number; today: string }): EventsReport {
  const todayMs = maturity ? Date.parse(maturity.today) : Infinity;
  const inWindow: EventRow[] = events
    .filter((e) => months.includes(e.date.slice(0, 7)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => {
      const cost = e.costGbp;
      return {
        ...e,
        mature: !maturity || Date.parse(e.date) + maturity.maturityDays * 86_400_000 <= todayMs,
        cpqo: typeof cost === "number" && e.qualified > 0 ? cost / e.qualified : null,
      };
    });
  const costed = inWindow.filter(hasCost);
  const costGbp = costed.reduce((s, e) => s + e.costGbp, 0);
  const qualifiedCosted = costed.reduce((s, e) => s + e.qualified, 0);
  return {
    events: inWindow,
    totals: {
      events: inWindow.length,
      attendees: inWindow.reduce((s, e) => s + e.attendees, 0),
      leads: inWindow.reduce((s, e) => s + e.leads, 0),
      qualified: inWindow.reduce((s, e) => s + e.qualified, 0),
      costedEvents: costed.length,
      costGbp,
      qualifiedCosted,
    },
    cpqo: costed.length && qualifiedCosted ? costGbp / qualifiedCosted : null,
  };
}

// ---- speed to lead ---------------------------------------------------------------------

export interface SpeedToLead {
  /** Enquiries in the window that have a first contact logged. */
  measured: number;
  /** Enquiries that expect a reply (everything but newsletter sign-ups). */
  expected: number;
  medianHours: number | null;
  /** Share of expected enquiries contacted within 24 hours. */
  within24h: number | null;
}

export function speedToLead(enquiries: Enquiry[], months: string[]): SpeedToLead {
  const expected = enquiries.filter((e) => months.includes(monthOf(e.createdAt)) && e.form !== "newsletter");
  const hours = expected
    .filter((e) => e.firstContactAt)
    .map((e) => (Date.parse(e.firstContactAt!) - Date.parse(e.createdAt)) / 3_600_000)
    .sort((a, b) => a - b);
  const median = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;
  return {
    measured: hours.length,
    expected: expected.length,
    medianHours: median === null ? null : Math.round(median * 10) / 10,
    within24h: expected.length ? hours.filter((h) => h <= 24).length / expected.length : null,
  };
}

// ---- data quality ----------------------------------------------------------------------

export interface QualityCount {
  count: number;
  total: number;
  share: number;
}

export interface DataQuality {
  /** Deals in the window with no Source channel: they fall into "unattributed". */
  dealsNoChannel: QualityCount;
  /** Website-channel deals with no source/medium label: converted without the lead's attribution. */
  websiteDealsNoLabel: QualityCount;
  /** Enquiries with no Pipedrive person: cannot be matched to a deal. */
  enquiriesNoPerson: QualityCount;
  /** Enquiries expecting a reply with no activity logged yet. */
  enquiriesNoContact: QualityCount;
  /** Months in the window with no spend entered. */
  monthsNoSpend: string[];
  /** Deals in the window with no channel, newest first, for fixing in Pipedrive. */
  dealsToFix: Deal[];
  /** Deals in the window, for rules that need to look at them directly. */
  deals: Deal[];
}

function count(count: number, total: number): QualityCount {
  return { count, total, share: total ? count / total : 0 };
}

export function dataQuality(data: Pick<DashboardData, "deals" | "enquiries">, spend: SpendEntry[], months: string[]): DataQuality {
  const deals = data.deals.filter((d) => months.includes(monthOf(d.createdAt)));
  const enquiries = data.enquiries.filter((e) => months.includes(monthOf(e.createdAt)));
  const website = deals.filter((d) => d.channel === "Website");
  const expecting = enquiries.filter((e) => e.form !== "newsletter");
  const noChannel = deals.filter((d) => d.channel === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    dealsNoChannel: count(noChannel.length, deals.length),
    websiteDealsNoLabel: count(website.filter((d) => !d.sourceLabel).length, website.length),
    enquiriesNoPerson: count(enquiries.filter((e) => e.personId === null).length, enquiries.length),
    enquiriesNoContact: count(expecting.filter((e) => !e.firstContactAt).length, expecting.length),
    monthsNoSpend: months.filter((m) => !spend.some((s) => s.month === m)),
    dealsToFix: noChannel,
    deals,
  };
}

// ---- alerts ----------------------------------------------------------------------------

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertGroup = "data" | "performance";

export interface Alert {
  id: string;
  group: AlertGroup;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Page that deals with it. */
  href: string;
}

export interface AlertRule {
  id: string;
  group: AlertGroup;
  /** The rule in plain words, as the Alerts page lists it. */
  title: string;
  enabled: boolean;
  /** Why it is off, when it is. */
  note?: string;
}

/** Every rule the Alerts page checks, in the order it lists them. `buildAlerts` evaluates the enabled ones. */
export const ALERT_RULES: readonly AlertRule[] = [
  { id: "pipedrive-stale", group: "data", title: "No new data from Pipedrive for 2 days", enabled: true },
  { id: "deals-no-channel", group: "data", title: "More than 3% of deals without a source channel", enabled: true },
  { id: "deals-no-qualification", group: "data", title: "Deals with no qualification status after 14 days", enabled: false, note: "Off until the field exists in Pipedrive" },
  { id: "spend-missing", group: "data", title: "No spend entered for the month", enabled: true },
  { id: "below-target", group: "performance", title: "Qualified opportunities more than 25% below target", enabled: true },
  { id: "cpqo-up", group: "performance", title: "Cost per qualified opportunity more than 30% above the trailing 3-month average", enabled: true },
  { id: "paid-no-qualified", group: "performance", title: "A paid channel with spend but no qualified enquiries in the month", enabled: true },
];

export interface AlertInput {
  report: Report;
  quality: DataQuality;
  config: KpiConfig;
  /** Wall-clock instant, for staleness. */
  now: string;
}

const DAY = 86_400_000;

/** Rules a monthly ritual needs to hear about, in order of severity within each group. Thresholds are deliberate and visible here. */
export function buildAlerts({ report, quality, config, now }: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  const h = report.headline;
  const month = monthLabel(report.reportMonth);

  // ---- data
  const ageDays = (Date.parse(now) - Date.parse(report.syncedAt)) / DAY;
  if (ageDays > 2) {
    alerts.push({
      id: "pipedrive-stale",
      group: "data",
      severity: "critical",
      title: "No new data from Pipedrive for 2 days",
      detail: `The last record arrived ${Math.floor(ageDays)} days ago. Pipedrive sends changes as they happen, so a quiet feed usually means the webhook has stopped.`,
      href: "/kpi-rule",
    });
  }
  if (quality.dealsNoChannel.share > 0.03) {
    alerts.push({
      id: "deals-no-channel",
      group: "data",
      severity: "info",
      title: "Deals without a source channel",
      detail: `${quality.dealsNoChannel.count} of ${quality.dealsNoChannel.total} deals in the last 12 months (${pct(quality.dealsNoChannel.share)}) have no Source channel, so they are counted as unattributed.`,
      href: "/data-quality",
    });
  }
  if (config.qualificationStatusInPipedrive) {
    const cutoff = Date.parse(now) - config.qualificationStatusDays * DAY;
    const unqualified = quality.deals.filter((d) => Date.parse(d.createdAt) <= cutoff && !d.qualificationStatus);
    if (unqualified.length > 0) {
      alerts.push({
        id: "deals-no-qualification",
        group: "data",
        severity: "info",
        title: `Deals with no qualification status after ${config.qualificationStatusDays} days`,
        detail: `${unqualified.length} ${unqualified.length === 1 ? "deal" : "deals"} older than ${config.qualificationStatusDays} days still have no qualification status in Pipedrive.`,
        href: "/data-quality",
      });
    }
  }
  if (quality.monthsNoSpend.includes(report.reportMonth)) {
    alerts.push({ id: "spend-missing", group: "data", severity: "warning", title: `No spend entered for ${month}`, detail: "Cost per qualified opportunity is blank until the month's spend is in.", href: "/spend" });
  }

  // ---- performance
  if (h.qualified < config.targetQualifiedPerMonth * 0.75) {
    alerts.push({
      id: "below-target",
      group: "performance",
      severity: "warning",
      title: `${month} is well below target`,
      detail: `${h.qualified} qualified inbound opportunities against a target of ${config.targetQualifiedPerMonth}, ${pct(1 - h.qualified / config.targetQualifiedPerMonth)} short.`,
      href: "/",
    });
  }
  if (h.cpqoMonth !== null && h.cpqoTrailing !== null && h.cpqoMonth > h.cpqoTrailing * 1.3) {
    alerts.push({
      id: "cpqo-up",
      group: "performance",
      severity: "warning",
      title: "Cost per qualified opportunity jumped",
      detail: `${gbp(h.cpqoMonth)} in ${month} against a ${config.trailingMonths}-month average of ${gbp(h.cpqoTrailing)}, up ${pct(h.cpqoMonth / h.cpqoTrailing - 1)}.`,
      href: "/spend",
    });
  }
  for (const p of report.spendByPlatformMonth) {
    if (p.amountGbp > 0 && p.qualified === 0) {
      alerts.push({
        id: `paid-no-qualified-${p.platform}`,
        group: "performance",
        severity: "warning",
        title: `${p.label} spent with no qualified enquiries`,
        detail: `${gbp(p.amountGbp)} on ${p.label} in ${month} and nothing has qualified from it yet.`,
        href: "/spend",
      });
    }
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---- monthly summary -------------------------------------------------------------------

function sign(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * The month in plain words, for the meeting note or a Teams message: six short lines at most,
 * one figure per line, sources by the same channel names the rest of the dashboard uses.
 */
export function summaryText(report: Report, config: KpiConfig): string {
  const h = report.headline;
  const month = monthLabel(report.reportMonth);
  const prev = monthLabel(report.prevMonth);
  const top = report.sources
    .filter((s) => s.enquiries > 0)
    .slice(0, 3)
    .map((s) => `${s.group} ${integer(s.enquiries)}`)
    .join(", ");
  const lines = [
    `Marketing, ${month}`,
    `Qualified opportunities: ${h.qualified}, ${sign(h.qualifiedDelta)} vs ${prev}. Target ${config.targetQualifiedPerMonth}, ${config.trailingMonths}-month average ${h.trailingAvg.toFixed(1)}.`,
    `Cost per qualified: ${gbp(h.cpqoMonth)} this month, ${gbp(h.cpqoTrailing)} over ${config.trailingMonths} months, on ${gbp(h.spendMonth)} spend.`,
    `Enquiries: ${integer(h.enquiries)}, ${sign(h.enquiries - h.enquiriesPrev)} vs ${prev}.`,
    `Top sources, ${windowLabel(report.trailingMonths)}: ${top || "none"}.`,
  ];
  if (h.qualifiedLastYear !== null) lines.push(`Same month last year: ${h.qualifiedLastYear} qualified, ${integer(h.enquiriesLastYear ?? 0)} enquiries.`);
  return lines.join("\n");
}

export type { MonthlyQualified };
