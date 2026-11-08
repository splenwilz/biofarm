/**
 * KPI calculations. Pure functions over the domain records; every rule they
 * apply comes from the KpiConfig passed in, never from constants here.
 */

import { QUALIFICATION_CHECKS, type KpiConfig } from "@/config/kpi";
import { CHANNEL_NAMES } from "@/lib/channelNames";
import type { Audience, Channel, Deal, Enquiry, Pipeline, SourceGroup, SpendEntry, SpendPlatform } from "@/lib/types";

const DAY_MS = 86_400_000;

// ---- months ---------------------------------------------------------------------

/** Calendar month ("YYYY-MM") of an ISO date or date-time string. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** The `count` months ending at `end` ("YYYY-MM"), oldest first. */
export function monthRange(end: string, count: number): string[] {
  const [year, month] = end.split("-").map(Number);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function monthEndMs(month: string): number {
  const [year, m] = month.split("-").map(Number);
  // the first instant of the next month
  return Date.UTC(year, m, 1);
}

// ---- qualified opportunities ----------------------------------------------------------

export type Attribution = "inbound" | "network" | "unattributed";

export function attributionOf(channel: Channel | null, cfg: KpiConfig): Attribution {
  if (channel && cfg.inboundChannels.includes(channel)) return "inbound";
  if (channel && cfg.networkChannels.includes(channel)) return "network";
  return "unattributed";
}

/** An enquiry is inbound, outbound / network or unattributed by its Pipedrive channel, the same split as deals. */
export function enquiryAttribution(enquiry: Enquiry, cfg: KpiConfig): Attribution {
  return attributionOf(enquiry.channel, cfg);
}

/** Marketing's enquiries: the inbound ones. Outbound / network and unattributed records are context, not the number. */
export function inboundEnquiries(enquiries: Enquiry[], cfg: KpiConfig): Enquiry[] {
  return enquiries.filter((e) => enquiryAttribution(e, cfg) === "inbound");
}

/**
 * The draft checks that are switched on, applied to a deal's recorded results.
 * A deal with no results, or none for a given check, is left as the stage move
 * decided; only a recorded fail on a check that is on removes it.
 */
export function passesChecks(deal: Deal, cfg: KpiConfig): boolean {
  if (!deal.checks) return true;
  return QUALIFICATION_CHECKS.every((c) => !cfg.qualificationChecks[c.id] || deal.checks![c.id] !== false);
}

function isQualified(deal: Deal, cfg: KpiConfig, pipeline?: Pipeline): deal is Deal & { qualifiedAt: string } {
  if (!deal.qualifiedAt) return false;
  if (!cfg.pipelines.includes(deal.pipeline)) return false;
  if (pipeline !== undefined && deal.pipeline !== pipeline) return false;
  return passesChecks(deal, cfg);
}

function monthIndex(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m;
}

/**
 * The qualified inbound target for one month: the ramp's start value until the
 * ramp begins, an even climb to the 2027 figure, then that figure. A ramp whose
 * end is not after its start is treated as already finished.
 */
export function qualifiedTargetForMonth(cfg: KpiConfig, month: string): number {
  const { fromMonth, fromValue, toMonth } = cfg.qualifiedRamp;
  const target = cfg.targetQualifiedPerMonth;
  if (fromMonth >= toMonth || month >= toMonth) return target;
  if (month <= fromMonth) return fromValue;
  const done = monthIndex(month) - monthIndex(fromMonth);
  const steps = monthIndex(toMonth) - monthIndex(fromMonth);
  return Math.round(fromValue + ((target - fromValue) * done) / steps);
}

/** Qualified deals that count for marketing: inbound channel, configured pipeline. */
export function qualifiedInbound(deals: Deal[], cfg: KpiConfig, pipeline?: Pipeline): Deal[] {
  return deals.filter((d) => isQualified(d, cfg, pipeline) && attributionOf(d.channel, cfg) === "inbound");
}

export interface MonthlyQualified {
  month: string;
  inbound: number;
  network: number;
  unattributed: number;
}

export function qualifiedByMonth(
  deals: Deal[],
  months: string[],
  cfg: KpiConfig,
  pipeline?: Pipeline,
): MonthlyQualified[] {
  const rows = new Map(months.map((m) => [m, { month: m, inbound: 0, network: 0, unattributed: 0 }]));
  for (const deal of deals) {
    if (!isQualified(deal, cfg, pipeline)) continue;
    const row = rows.get(monthOf(deal.qualifiedAt));
    if (row) row[attributionOf(deal.channel, cfg)] += 1;
  }
  return months.map((m) => rows.get(m)!);
}

// ---- spend and CPQO -------------------------------------------------------------------

export interface MonthlySpend {
  month: string;
  spendGbp: number;
}

export function spendByMonth(spend: SpendEntry[], months: string[]): MonthlySpend[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const entry of spend) {
    if (totals.has(entry.month)) totals.set(entry.month, totals.get(entry.month)! + entry.amountGbp);
  }
  return months.map((m) => ({ month: m, spendGbp: Math.round(totals.get(m)! * 100) / 100 }));
}

/** Cost per qualified opportunity; null when there were no opportunities to divide by. */
/** Spend over qualified opportunities; null when there is nothing to divide, or no spend recorded yet (waiting for data, not free). */
export function cpqo(spendGbp: number, qualified: number): number | null {
  if (qualified <= 0 || spendGbp <= 0) return null;
  return spendGbp / qualified;
}

export function trailingSum(values: number[], count: number): number {
  return values.slice(-count).reduce((sum, v) => sum + v, 0);
}

// ---- source groups ---------------------------------------------------------------------

/** The reporting groups in their fixed order; every row set lists all eight. */
export const SOURCE_GROUPS: readonly SourceGroup[] = [
  CHANNEL_NAMES.paidSearch,
  CHANNEL_NAMES.organicSearch,
  CHANNEL_NAMES.linkedinAds,
  CHANNEL_NAMES.linkedinPosts,
  CHANNEL_NAMES.newsletter,
  CHANNEL_NAMES.referral,
  CHANNEL_NAMES.events,
  CHANNEL_NAMES.websiteUntracked,
  CHANNEL_NAMES.infoInbox,
  CHANNEL_NAMES.marketplace,
  CHANNEL_NAMES.direct,
];

/** Groups that carry media spend, so a cost per qualified means something. */
export const PAID_GROUPS: ReadonlySet<SourceGroup> = new Set<SourceGroup>(["Paid search", "LinkedIn ads"]);

export interface SourceKey {
  group: SourceGroup;
  /** The platform inside the group: an ad network, a search engine, a referring site. */
  platform: string;
}

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid-search", "paidsearch", "sem"]);
const EMAIL_SOURCES = new Set(["newsletter", "pipedrive", "mailchimp", "campaign"]);
const SEARCH_HOST = /^(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|ecosia\.org)$/;
/** Referring hosts with a name people know them by; any other referrer is shown by its host. */
const REFERRER_NAMES: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "perplexity.ai": "Perplexity",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "you.com": "You.com",
  "t.co": "X (Twitter)",
  "twitter.com": "X (Twitter)",
  "x.com": "X (Twitter)",
  facebook: "Facebook",
  "facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "youtube.com": "YouTube",
};

const CHANNEL_SOURCE: Record<Channel, SourceKey> = {
  Website: { group: "Website (source not tracked)", platform: "Website" },
  "Info email inbox": { group: "Info email inbox", platform: "Info email inbox" },
  Linkedin: { group: "LinkedIn posts", platform: "LinkedIn" },
  "Trade Show / Event": { group: "Events", platform: "Trade show or event" },
  Marketplace: { group: "Marketplace", platform: "Marketplace" },
  // outbound / network channels never reach the source table (not marketing's number); listed for completeness
  "Campaigns / Outreach": { group: "Direct/unknown", platform: "Campaigns / Outreach" },
  Introducer: { group: "Direct/unknown", platform: "Introducer" },
  "Existing Network": { group: "Direct/unknown", platform: "Existing Network" },
};

/** Where spend entered per ad platform lands in the source table. */
const SPEND_SOURCE: Record<SpendPlatform, SourceKey> = {
  google_ads: { group: "Paid search", platform: "Google Ads" },
  microsoft_ads: { group: "Paid search", platform: "Microsoft Ads" },
  linkedin_ads: { group: "LinkedIn ads", platform: "LinkedIn Ads" },
  other: { group: "Paid search", platform: "Other paid search" },
};

/** The groups a Website deal lands in once its "source/medium" label is read. */
const WEBSITE_GROUPS: readonly SourceGroup[] = [
  CHANNEL_NAMES.paidSearch,
  CHANNEL_NAMES.organicSearch,
  CHANNEL_NAMES.linkedinAds,
  CHANNEL_NAMES.linkedinPosts,
  CHANNEL_NAMES.newsletter,
  CHANNEL_NAMES.referral,
  CHANNEL_NAMES.websiteUntracked,
  CHANNEL_NAMES.direct,
];

/** The inbound channels by the shared channel names, in the Sources page order; Website is split into the groups it becomes. */
export function inboundSourceGroups(cfg: KpiConfig): SourceGroup[] {
  const groups = new Set<SourceGroup>();
  for (const channel of cfg.inboundChannels) {
    if (channel === "Website") WEBSITE_GROUPS.forEach((g) => groups.add(g));
    else groups.add(CHANNEL_SOURCE[channel].group);
  }
  return SOURCE_GROUPS.filter((g) => groups.has(g));
}

const isGoogle = (source: string) => source === "google" || source.startsWith("google.");
const isMicrosoft = (source: string) => source === "bing" || source === "microsoft" || source.startsWith("bing.");

/**
 * Which reporting group and platform a record belongs to. The "source/medium"
 * label from the website is the more specific signal, so it is read first;
 * Pipedrive's Source channel decides when there is no label or it says nothing useful.
 */
export function sourceOf(label: string | null, channel: Channel | null): SourceKey {
  if (label) {
    const [source, rawMedium = ""] = label.toLowerCase().split("/");
    // a bare host as the source with no medium (ChatGPT tags visits utm_source=chatgpt.com) is a referral from that host
    const medium = rawMedium || (source.includes(".") && !source.includes(" ") ? "referral" : "");
    if (source.includes("linkedin")) {
      return PAID_MEDIUMS.has(medium) || medium.startsWith("paid") ? { group: "LinkedIn ads", platform: "LinkedIn Ads" } : { group: "LinkedIn posts", platform: "LinkedIn" };
    }
    if (PAID_MEDIUMS.has(medium)) {
      if (isGoogle(source)) return SPEND_SOURCE.google_ads;
      if (isMicrosoft(source)) return SPEND_SOURCE.microsoft_ads;
      return SPEND_SOURCE.other;
    }
    if (medium === "email" || EMAIL_SOURCES.has(source)) return { group: "Newsletter", platform: "Newsletter" };
    if (medium === "referral" && SEARCH_HOST.test(source)) {
      return { group: "Organic search", platform: isGoogle(source) ? "Google" : isMicrosoft(source) ? "Bing" : "Other search engines" };
    }
    if (label === "direct") return CHANNEL_SOURCE.Website;
    if (medium === "referral" || medium === "social") return { group: "Referral", platform: REFERRER_NAMES[source] ?? source };
  }
  return channel ? CHANNEL_SOURCE[channel] : { group: "Direct/unknown", platform: "Unknown" };
}

/**
 * Which ad platform paid for a record, from its "source/medium" label: the join
 * between spend (entered per platform) and the opportunities it produced.
 */
export function platformOf(label: string | null): SpendPlatform | null {
  if (!label) return null;
  const [source, medium = ""] = label.toLowerCase().split("/");
  if (source.includes("linkedin") && (medium.startsWith("paid") || PAID_MEDIUMS.has(medium))) return "linkedin_ads";
  if (!PAID_MEDIUMS.has(medium)) return null;
  if (isGoogle(source)) return "google_ads";
  if (isMicrosoft(source)) return "microsoft_ads";
  return "other";
}

// ---- enquiries by source -------------------------------------------------------------

export interface PlatformRow {
  platform: string;
  enquiries: number;
  /** The enquiries the share is measured over: leads, not deals the team created directly (those qualify the same day by definition). */
  conversionBase: number;
  qualified: number;
  /** Qualified opportunities that are not themselves directly created deals. */
  qualifiedFromLeads: number;
  /** qualifiedFromLeads / conversionBase, or null when there is nothing to measure over. */
  conversion: number | null;
  /** Spend in the window for paid platforms; null for unpaid ones, whose cost column stays blank. */
  spendGbp: number | null;
  /** spendGbp / qualified; null when either is missing. */
  cpqo: number | null;
}

export interface SourceRow extends Omit<PlatformRow, "platform"> {
  group: SourceGroup;
  /** The platforms inside the group that had any enquiries, opportunities or spend, biggest first. */
  platforms: PlatformRow[];
}

function audienceMatches(audience: Audience | undefined, record: { audience?: Audience; pipeline?: Pipeline }): boolean {
  if (audience === undefined) return true;
  return (record.audience ?? record.pipeline) === audience;
}

const byVolume = (a: { enquiries: number; qualified: number }, b: { enquiries: number; qualified: number }) => b.enquiries - a.enquiries || b.qualified - a.qualified;

/** A deal the team created directly (not converted from a lead): it qualifies on the same day by definition, so it stays out of every qualified share. */
export function isDirectDeal(e: Enquiry): boolean {
  return e.kind === "deal" && !e.converted;
}

/** The ids of the deals the team created directly. */
export function directDealIds(enquiries: Enquiry[]): Set<string> {
  return new Set(enquiries.filter(isDirectDeal).map((e) => e.id));
}

/**
 * Enquiries, qualified opportunities and spend per source group over a window,
 * each group carrying its platforms. Spend is audience-neutral, so with an
 * audience chosen the cost columns divide the whole spend by that audience's results.
 */
export function enquiriesBySource(enquiries: Enquiry[], deals: Deal[], spend: SpendEntry[], months: string[], cfg: KpiConfig, audience?: Audience): SourceRow[] {
  const inRange = new Set(months);
  const groups = new Map<SourceGroup, Map<string, PlatformRow>>(SOURCE_GROUPS.map((g) => [g, new Map()]));
  const cell = ({ group, platform }: SourceKey) => {
    const platforms = groups.get(group)!;
    let r = platforms.get(platform);
    if (!r) {
      r = { platform, enquiries: 0, conversionBase: 0, qualified: 0, qualifiedFromLeads: 0, conversion: null, spendGbp: PAID_GROUPS.has(group) ? 0 : null, cpqo: null };
      platforms.set(platform, r);
    }
    return r;
  };
  const directDeals = directDealIds(enquiries);
  for (const e of inboundEnquiries(enquiries, cfg)) {
    if (!inRange.has(monthOf(e.createdAt)) || !audienceMatches(audience, e)) continue;
    const r = cell(sourceOf(e.sourceLabel, e.channel));
    r.enquiries += 1;
    if (!isDirectDeal(e)) r.conversionBase += 1;
  }
  const pipeline = audience === "developer" || audience === "landowner" ? audience : undefined;
  if (audience === undefined || pipeline) {
    for (const d of qualifiedInbound(deals, cfg, pipeline)) {
      if (!inRange.has(monthOf(d.qualifiedAt!))) continue;
      const r = cell(sourceOf(d.sourceLabel, d.channel));
      r.qualified += 1;
      if (!directDeals.has(d.id)) r.qualifiedFromLeads += 1;
    }
  }
  for (const entry of spend) {
    if (!inRange.has(entry.month)) continue;
    const r = cell(SPEND_SOURCE[entry.platform]);
    r.spendGbp = (r.spendGbp ?? 0) + entry.amountGbp;
  }
  const finish = <T extends Omit<PlatformRow, "platform">>(r: T): T => {
    r.spendGbp = r.spendGbp === null ? null : Math.round(r.spendGbp * 100) / 100;
    r.conversion = r.conversionBase > 0 ? r.qualifiedFromLeads / r.conversionBase : null;
    r.cpqo = r.spendGbp ? cpqo(r.spendGbp, r.qualified) : null;
    return r;
  };
  return SOURCE_GROUPS.map((group) => {
    const platforms = [...groups.get(group)!.values()].map(finish).sort(byVolume);
    const sum = (pick: (p: PlatformRow) => number) => platforms.reduce((s, p) => s + pick(p), 0);
    return finish({
      group,
      enquiries: sum((p) => p.enquiries),
      conversionBase: sum((p) => p.conversionBase),
      qualified: sum((p) => p.qualified),
      qualifiedFromLeads: sum((p) => p.qualifiedFromLeads),
      conversion: null,
      spendGbp: PAID_GROUPS.has(group) ? sum((p) => p.spendGbp ?? 0) : null,
      cpqo: null,
      platforms,
    });
  }).sort((a, b) => byVolume(a, b) || SOURCE_GROUPS.indexOf(a.group) - SOURCE_GROUPS.indexOf(b.group));
}

export interface PaidSummary {
  enquiries: number;
  /** Paid groups' share of all enquiries in the window; null when there were none. */
  share: number | null;
  spendGbp: number;
  qualified: number;
  /** Total paid spend ÷ qualified opportunities from paid groups. */
  cpqo: number | null;
}

/** The paid groups rolled up: their share of enquiries and what a qualified opportunity cost across them. */
export function paidSummary(rows: SourceRow[]): PaidSummary {
  const paid = rows.filter((r) => PAID_GROUPS.has(r.group));
  const total = rows.reduce((s, r) => s + r.enquiries, 0);
  const enquiries = paid.reduce((s, r) => s + r.enquiries, 0);
  const spendGbp = Math.round(paid.reduce((s, r) => s + (r.spendGbp ?? 0), 0) * 100) / 100;
  const qualified = paid.reduce((s, r) => s + r.qualified, 0);
  return { enquiries, share: total ? enquiries / total : null, spendGbp, qualified, cpqo: spendGbp > 0 ? cpqo(spendGbp, qualified) : null };
}

// ---- cohorts ----------------------------------------------------------------------------

export interface CohortRow {
  month: string;
  enquiries: number;
  /** The enquiries the shares are measured over: leads, not deals created directly. */
  base: number;
  /** horizon in days -> enquiries that had qualified within that many days */
  qualifiedBy: Record<number, number>;
  /** false while the cohort is younger than the maturity window */
  mature: boolean;
}

/** Days from an enquiry to the first qualifying inbound deal for the same person, or null. */
function daysToQualify(enquiry: Enquiry, qualifiedDeals: Deal[]): number | null {
  if (enquiry.personId === null) return null;
  const start = Date.parse(enquiry.createdAt);
  let best: number | null = null;
  for (const d of qualifiedDeals) {
    if (d.personId !== enquiry.personId) continue;
    const at = Date.parse(d.qualifiedAt!);
    if (at < start) continue;
    const days = (at - start) / DAY_MS;
    if (best === null || days < best) best = days;
  }
  return best;
}

export function cohortTable(
  enquiries: Enquiry[],
  deals: Deal[],
  months: string[],
  cfg: KpiConfig,
  todayIso: string,
): CohortRow[] {
  const qualified = qualifiedInbound(deals, cfg);
  const today = Date.parse(todayIso);
  return months.map((month) => {
    const cohort = inboundEnquiries(enquiries, cfg).filter((e) => monthOf(e.createdAt) === month);
    const base = cohort.filter((e) => !isDirectDeal(e));
    const qualifiedBy: Record<number, number> = Object.fromEntries(cfg.cohortHorizonsDays.map((h) => [h, 0]));
    for (const e of base) {
      const days = daysToQualify(e, qualified);
      if (days === null) continue;
      for (const h of cfg.cohortHorizonsDays) if (days <= h) qualifiedBy[h] += 1;
    }
    return {
      month,
      enquiries: cohort.length,
      base: base.length,
      qualifiedBy,
      mature: monthEndMs(month) + cfg.cohortMaturityDays * DAY_MS <= today,
    };
  });
}
