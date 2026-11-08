import type { KpiConfig } from "@/config/kpi";
import type { Filters } from "@/lib/filters";
import {
  cohortTable,
  cpqo,
  enquiriesBySource,
  enquiryAttribution,
  inboundEnquiries,
  monthOf,
  monthRange,
  platformOf,
  qualifiedByMonth,
  qualifiedInbound,
  spendByMonth,
  trailingSum,
  type CohortRow,
  type MonthlyQualified,
  type MonthlySpend,
  type SourceRow,
} from "@/lib/kpi";
import { PLATFORM_LABEL } from "@/lib/format";
import type { DashboardData, Enquiry, SpendEntry, SpendPlatform } from "@/lib/types";

export interface Headline {
  qualified: number;
  qualifiedPrev: number;
  qualifiedDelta: number;
  trailingAvg: number;
  spendMonth: number;
  spendPrev: number;
  cpqoMonth: number | null;
  cpqoPrev: number | null;
  cpqoTrailing: number | null;
  /** Inbound enquiries in the report month: marketing's number. */
  enquiries: number;
  enquiriesPrev: number;
  enquiriesTrailing: number;
  /** The report month's outbound / network enquiries and those with no channel set: shown for context, not counted. */
  enquiriesNetwork: number;
  enquiriesUnattributed: number;
  /** Inbound enquiries in the report month whose audience is not known (Pipedrive leads carry none); 0 when all audiences are shown. */
  enquiriesAudienceUnknown: number;
  /** Same month a year earlier; null when the data does not reach back that far. */
  qualifiedLastYear: number | null;
  enquiriesLastYear: number | null;
  cpqoLastYear: number | null;
}

export interface Report {
  /** The "as of" instant the report was built against (the data's sync time). */
  syncedAt: string;
  reportMonth: string;
  prevMonth: string;
  months: string[];
  /** The breakdown window from the filters (1, 3 or 12 months), ending at the report month. */
  trailingMonths: string[];
  /** The window of the same length just before it, for the comparison lines. */
  prevTrailingMonths: string[];
  trend: MonthlyQualified[];
  /** All-audience trend; the CPQO denominator, since spend cannot be split by audience. */
  trendAll: MonthlyQualified[];
  spendRows: MonthlySpend[];
  sources: SourceRow[];
  /** The same breakdown for the previous window. */
  sourcesPrev: SourceRow[];
  cohorts: CohortRow[];
  /** The inbound enquiries for the chosen audience (all months): what every page counts from. */
  enquiries: Enquiry[];
  /** Inbound enquiries per month of the window, for the chosen audience. */
  enquiriesByMonth: number[];
  /** Cost per qualified opportunity per month; null where there was no spend or no opportunity. */
  cpqoByMonth: (number | null)[];
  /** The window's spend by platform, largest first, with the qualified opportunities each platform paid for. */
  spendByPlatform: PlatformSpend[];
  /** The same for the report month alone, for the alert rules. */
  spendByPlatformMonth: PlatformSpend[];
  headline: Headline;
}

export interface PlatformSpend {
  platform: SpendPlatform;
  label: string;
  amountGbp: number;
  share: number;
  /** Qualified inbound opportunities in the month whose source label names this platform, all audiences. */
  qualified: number;
  cpqo: number | null;
}

/**
 * Everything the pages show, derived once from the records, the KPI config and
 * the URL filters. Pure, so the same numbers appear on every page.
 */
export function buildReport(
  data: Pick<DashboardData, "deals" | "enquiries">,
  spend: SpendEntry[],
  config: KpiConfig,
  filters: Filters,
  today: string,
): Report {
  const months = monthRange(filters.month, 12);
  const trailingMonths = months.slice(-filters.window);
  const prevTrailingMonths = monthRange(monthRange(trailingMonths[0], 2)[0], filters.window);
  const pipeline = filters.audience === "all" ? undefined : filters.audience;
  const last = months.length - 1;

  const trend = qualifiedByMonth(data.deals, months, config, pipeline);
  const trendAll = pipeline ? qualifiedByMonth(data.deals, months, config) : trend;
  const spendRows = spendByMonth(spend, months);
  const sources = enquiriesBySource(data.enquiries, data.deals, spend, trailingMonths, config, pipeline);
  const sourcesPrev = enquiriesBySource(data.enquiries, data.deals, spend, prevTrailingMonths, config, pipeline);
  const cohorts = cohortTable(data.enquiries, data.deals, months, config, today);

  const inboundOnly = inboundEnquiries(data.enquiries, config);
  const forAudience = (list: Enquiry[]) => (filters.audience === "all" ? list : list.filter((e) => e.audience === filters.audience));
  const enquiries = forAudience(inboundOnly);
  const countIn = (list: Enquiry[], ms: string[]) => forAudience(list).filter((e) => ms.includes(monthOf(e.createdAt))).length;
  const enquiryCount = (ms: string[]) => countIn(inboundOnly, ms);
  const contextCount = (kind: "network" | "unattributed", ms: string[]) =>
    countIn(data.enquiries.filter((e) => enquiryAttribution(e, config) === kind), ms);

  const inbound = trend.map((r) => r.inbound);
  const spendMonth = spendRows[last].spendGbp;
  const spendPrev = spendRows[last - 1].spendGbp;
  const enquiriesByMonth = months.map((m) => enquiryCount([m]));
  const cpqoByMonth = spendRows.map((row, i) => (row.spendGbp > 0 ? cpqo(row.spendGbp, trendAll[i].inbound) : null));
  const qualifiedDeals = qualifiedInbound(data.deals, config);
  const platformSpend = (ms: string[]): PlatformSpend[] => {
    const byPlatform = new Map<SpendPlatform, number>();
    for (const entry of spend) {
      if (ms.includes(entry.month)) byPlatform.set(entry.platform, (byPlatform.get(entry.platform) ?? 0) + entry.amountGbp);
    }
    const total = [...byPlatform.values()].reduce((s, v) => s + v, 0);
    const qualifiedByPlatform = new Map<SpendPlatform, number>();
    for (const d of qualifiedDeals) {
      if (!d.qualifiedAt || !ms.includes(monthOf(d.qualifiedAt))) continue;
      const platform = platformOf(d.sourceLabel);
      if (platform) qualifiedByPlatform.set(platform, (qualifiedByPlatform.get(platform) ?? 0) + 1);
    }
    return [...byPlatform.entries()]
      .map(([platform, amountGbp]) => {
        const qualified = qualifiedByPlatform.get(platform) ?? 0;
        return { platform, label: PLATFORM_LABEL[platform], amountGbp, share: total ? amountGbp / total : 0, qualified, cpqo: cpqo(amountGbp, qualified) };
      })
      .sort((a, b) => b.amountGbp - a.amountGbp);
  };
  const spendByPlatform = platformSpend(trailingMonths);
  const spendByPlatformMonth = platformSpend([months[last]]);

  // the same month a year earlier, when the records reach back that far
  const lastYearMonth = monthRange(months[last], 13)[0];
  const hasLastYear = data.deals.some((d) => monthOf(d.createdAt) <= lastYearMonth) || data.enquiries.some((e) => monthOf(e.createdAt) <= lastYearMonth);
  const lastYear = hasLastYear ? qualifiedByMonth(data.deals, [lastYearMonth], config, pipeline)[0].inbound : null;
  const lastYearAll = hasLastYear ? qualifiedByMonth(data.deals, [lastYearMonth], config)[0].inbound : null;
  const lastYearSpend = spendByMonth(spend, [lastYearMonth])[0].spendGbp;

  return {
    syncedAt: today,
    reportMonth: months[last],
    prevMonth: months[last - 1],
    months,
    trailingMonths,
    prevTrailingMonths,
    trend,
    trendAll,
    spendRows,
    sources,
    sourcesPrev,
    cohorts,
    enquiries,
    enquiriesByMonth,
    cpqoByMonth,
    spendByPlatform,
    spendByPlatformMonth,
    headline: {
      qualified: inbound[last],
      qualifiedPrev: inbound[last - 1],
      qualifiedDelta: inbound[last] - inbound[last - 1],
      trailingAvg: trailingSum(inbound, config.trailingMonths) / config.trailingMonths,
      spendMonth,
      spendPrev,
      cpqoMonth: cpqo(spendMonth, trendAll[last].inbound),
      cpqoPrev: cpqo(spendPrev, trendAll[last - 1].inbound),
      cpqoTrailing: cpqo(
        trailingSum(spendRows.map((r) => r.spendGbp), config.trailingMonths),
        trailingSum(trendAll.map((r) => r.inbound), config.trailingMonths),
      ),
      enquiries: enquiryCount([months[last]]),
      enquiriesPrev: enquiryCount([months[last - 1]]),
      enquiriesTrailing: enquiryCount(trailingMonths),
      enquiriesNetwork: contextCount("network", [months[last]]),
      enquiriesUnattributed: contextCount("unattributed", [months[last]]),
      enquiriesAudienceUnknown: filters.audience === "all" ? 0 : inboundOnly.filter((e) => e.audience === "other" && monthOf(e.createdAt) === months[last]).length,
      qualifiedLastYear: lastYear,
      enquiriesLastYear: hasLastYear ? enquiryCount([lastYearMonth]) : null,
      cpqoLastYear: hasLastYear && lastYearAll !== null && lastYearSpend > 0 ? cpqo(lastYearSpend, lastYearAll) : null,
    },
  };
}
