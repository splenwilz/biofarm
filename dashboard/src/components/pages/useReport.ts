"use client";

import { useMemo } from "react";

import { useDashboard } from "@/components/DashboardProvider";
import { useFilters } from "@/components/shell/useFilters";
import { AUDIENCE_LABEL } from "@/lib/filters";
import { dateLabel, monthLabel, windowLabel } from "@/lib/format";
import { buildReport } from "@/lib/report";

/** The report for the current URL filters, plus the strings every page repeats. */
export function useReport() {
  const { data, config, spend, today } = useDashboard();
  const { filters, setFilters, linkTo } = useFilters();
  const report = useMemo(() => buildReport(data, spend, config, filters, today), [data, spend, config, filters, today]);
  const provenance = `${data.source === "demo" ? "Demo data" : "Pipedrive"} · synced ${dateLabel(data.syncedAt)}`;
  const audience = AUDIENCE_LABEL[filters.audience];
  /** The period as words: the month the tiles show, and the window the breakdowns cover. */
  const period = { month: monthLabel(report.reportMonth), window: windowLabel(report.trailingMonths), windowMonths: filters.window };
  return { report, filters, setFilters, linkTo, config, data, provenance, audience, period };
}
