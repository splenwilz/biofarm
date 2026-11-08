"use client";

import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import NextLink from "next/link";
import { useMemo, useState } from "react";

import { AnnotationNotes } from "@/components/AnnotationNotes";
import { BarTable } from "@/components/charts/BarTable";
import { CohortHeatmap } from "@/components/charts/CohortHeatmap";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { TrendChart } from "@/components/TrendChart";
import { useDashboard } from "@/components/DashboardProvider";
import { useReport } from "@/components/pages/useReport";
import { Icon } from "@/components/shell/icons";
import {
  gbp,
  integer,
  monthLabel,
  monthName,
  pct,
  windowLabel,
} from "@/lib/format";
import { monthRange, qualifiedByMonth, type SourceRow } from "@/lib/kpi";

export function ViewAll({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link
      component={NextLink}
      href={href}
      underline="hover"
      variant="body2"
      sx={{
        fontWeight: 600,
        color: "text.primary",
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {children}
      <Icon name="arrowRight" size={14} />
    </Link>
  );
}

/** Source rows as meters: track = enquiries, fill = the ones that qualified. */
export function sourceMeters(rows: SourceRow[], minEnquiries: number) {
  return rows.map((r) => ({
    key: r.group,
    label: r.group,
    value: Math.max(r.enquiries, r.qualified),
    valueText: `${integer(r.enquiries)} ${r.enquiries === 1 ? "enquiry" : "enquiries"}`,
    fill: r.qualified,
    fillText: `${integer(r.qualified)} qualified${r.conversion === null ? (r.qualified ? " · deals created by Sales" : "") : r.conversionBase >= minEnquiries ? ` · ${pct(r.conversion)}` : ""}`,
  }));
}

/**
 * The conversion column: the share of lead enquiries that qualified, once the row has
 * `minEnquiries` of them; a dash below that; "Sales-created" where the qualified deals
 * are the team's own (nothing to measure over) or outnumber the leads that preceded them.
 */
export function conversionText(r: { conversionBase: number; qualified: number; conversion: number | null }, minEnquiries: number): string {
  if (r.conversion === null || r.conversion > 1) return r.qualified ? "Sales-created" : "–";
  if (r.conversionBase < minEnquiries) return "–";
  return pct(r.conversion);
}

/** The change-row note under a cost per qualified while no spend has been entered. */
export const WAITING_FOR_SPEND = "Waiting for ad spend data";

type Range = 12 | 24;

export function OverviewPage() {
  const {
    report,
    filters,
    linkTo,
    config,
    audience,
    data,
    period,
  } = useReport();
  const { annotations, addAnnotation, removeAnnotation } = useDashboard();
  const [range, setRange] = useState<Range>(12);
  const lastYearMonth = monthRange(report.reportMonth, 13)[0];
  const h = report.headline;
  const month = period.month;
  const prev = `vs ${monthName(report.prevMonth)}`;
  const lastYear = monthLabel(lastYearMonth);
  const audienceNote =
    filters.audience === "all" ? "" : ` · ${audience.title.toLowerCase()}`;

  const pipeline = filters.audience === "all" ? undefined : filters.audience;
  const trend24 = useMemo(
    () =>
      qualifiedByMonth(
        data.deals,
        monthRange(report.reportMonth, 24),
        config,
        pipeline,
      ),
    [data.deals, report.reportMonth, config, pipeline],
  );
  const trendRows = range === 24 ? trend24 : report.trend;
  const cohortRows = [...report.cohorts].reverse().slice(0, 8);
  const target =
    filters.audience === "all"
      ? `Target ${integer(config.targetQualifiedPerMonth)}`
      : null;

  const exportRows = () =>
    report.months.map((m, i) => ({
      month: m,
      qualified_inbound: report.trend[i].inbound,
      network: report.trend[i].network,
      enquiries: report.enquiriesByMonth[i],
      spend_gbp: report.spendRows[i].spendGbp,
      cost_per_qualified_gbp: report.cpqoByMonth[i],
    }));

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Overview"
        subtitle={`${month} · ${audience.detail}`}
        info="The tiles show the month picked in the top bar. Top sources covers the window named on it, which the Sources page can change. The audience switcher narrows every number to one pipeline."
        actions={
          <ExportButton
            filename={`biofarm-marketing-overview-${report.reportMonth}${pipeline ? `-${pipeline}` : ""}`}
            rows={exportRows}
          />
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            testId="kpi-qualified"
            label="Qualified opportunities"
            value={integer(h.qualified)}
            delta={{ value: h.qualifiedDelta, note: prev }}
            info={[
              `Inbound deals qualified in ${monthName(report.reportMonth)}${audienceNote}, counted in the month they qualified. Network deals are left out.`,
              [
                target,
                `${config.trailingMonths}-month average ${h.trailingAvg.toFixed(1)}`,
                h.qualifiedLastYear === null
                  ? null
                  : `${lastYear}: ${integer(h.qualifiedLastYear)}`,
              ]
                .filter(Boolean)
                .join(" · ") + ".",
            ]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            testId="kpi-cpqo"
            label="Cost per qualified"
            value={gbp(h.cpqoMonth)}
            compare={h.spendMonth === 0 ? WAITING_FOR_SPEND : undefined}
            delta={
              h.cpqoMonth !== null && h.cpqoPrev !== null
                ? {
                    value: Math.round(h.cpqoMonth - h.cpqoPrev),
                    note: prev,
                    betterWhen: "down",
                    format: (v) => gbp(v),
                  }
                : undefined
            }
            info={[
              `${gbp(h.spendMonth)} media spend in ${monthName(report.reportMonth)} ÷ qualified inbound opportunities, all audiences.`,
              [
                `${config.trailingMonths}-month figure ${gbp(h.cpqoTrailing)}`,
                h.cpqoLastYear === null
                  ? null
                  : `${lastYear}: ${gbp(h.cpqoLastYear)}`,
              ]
                .filter(Boolean)
                .join(" · ") + ".",
            ]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            testId="kpi-enquiries"
            label="Enquiries"
            value={integer(h.enquiries)}
            delta={{ value: h.enquiries - h.enquiriesPrev, note: prev }}
            footnote={[filters.audience === "all" ? null : `${integer(h.enquiriesAudienceUnknown)} audience unknown`, `${integer(h.enquiriesNetwork)} outbound / network`, `${integer(h.enquiriesUnattributed)} no channel set`, "not counted"].filter(Boolean).join(" · ")}
            info={[
              `Inbound enquiries in ${monthName(report.reportMonth)}${audienceNote}: Pipedrive leads and deals the team created directly whose source channel is inbound (website, info inbox, LinkedIn, events, marketplace). Outbound / network records and those with no channel set are shown underneath for context.`,
              [
                `Last ${config.trailingMonths} months: ${integer(h.enquiriesTrailing)}`,
                h.enquiriesLastYear === null
                  ? null
                  : `${lastYear}: ${integer(h.enquiriesLastYear)}`,
              ]
                .filter(Boolean)
                .join(" · ") + ".",
            ]}
          />
        </Grid>
      </Grid>

      <Section
        id="trend"
        title="Qualified opportunities by month"
        subtitle={`${windowLabel(trendRows.map((r) => r.month))} · inbound in green; network deals in grey for context`}
        info="Each deal is counted in the month it qualified. Grey is network business brought in by Sales through introducers and existing contacts, shown for context; it is not marketing's number. The dashed line is the monthly target."
        action={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={range}
            onChange={(_, v: Range | null) => v && setRange(v)}
            aria-label="Months shown"
            data-print="hide"
          >
            <ToggleButton value={12} sx={{ px: 1.5, py: 0.5 }}>
              12 months
            </ToggleButton>
            <ToggleButton value={24} sx={{ px: 1.5, py: 0.5 }}>
              24 months
            </ToggleButton>
          </ToggleButtonGroup>
        }
      >
        <TrendChart
          rows={trendRows}
          target={
            filters.audience === "all"
              ? config.targetQualifiedPerMonth
              : undefined
          }
          annotations={annotations}
        />
        <AnnotationNotes
          months={range === 24 ? trend24.map((r) => r.month) : report.months}
          notes={annotations}
          onAdd={addAnnotation}
          onRemove={removeAnnotation}
        />
      </Section>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section
            id="sources"
            title="Top sources"
            subtitle={`${period.window}${audienceNote} · the darker part qualified`}
            info={`Source groups ranked by enquiries over the breakdown window, which the Sources page can change. Bar length is enquiries; the darker part is those that went on to qualify. Qualified % is the share of lead enquiries that qualified; deals the team created directly count as enquiries but not in the share, since they qualify the same day. It needs at least ${integer(config.qualifiedShareMinEnquiries)} lead enquiries. Where the qualified deals are all Sales-created, or outnumber the leads, the share reads Sales-created.`}
            action={<ViewAll href={linkTo("/sources")}>All sources</ViewAll>}
            padded={false}
            fullHeight
          >
            <BarTable
              ariaLabel="Top sources"
              labelHeader="Source"
              barHeader=""
              barWidth="26%"
              dense
              columns={["Enquiries", "Qualified", "Qualified %"]}
              rows={report.sources.map((r) => ({
                key: r.group,
                label: r.group,
                total: Math.max(r.enquiries, r.qualified),
                fill: r.qualified,
                cells: [
                  integer(r.enquiries),
                  integer(r.qualified),
                  conversionText(r, config.qualifiedShareMinEnquiries),
                ],
                muted: r.enquiries === 0,
              }))}
            />
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section
            id="cohorts"
            title="Enquiry to qualified"
            subtitle={`${windowLabel([...cohortRows].reverse().map((r) => r.month))} · share of each month's enquiries that qualified`}
            info="Each row is one month's enquiries, all audiences, and how many had qualified within 30, 90 and 150 days. Darker means a larger share. Months marked maturing are younger than the sales cycle. Hover a cell for the count."
            action={<ViewAll href={linkTo("/cohorts")}>All cohorts</ViewAll>}
            fullHeight
          >
            <CohortHeatmap
              compact
              caption={false}
              minEnquiries={config.qualifiedShareMinEnquiries}
              rows={cohortRows}
              horizons={config.cohortHorizonsDays}
            />
          </Section>
        </Grid>
      </Grid>
    </Stack>
  );
}
