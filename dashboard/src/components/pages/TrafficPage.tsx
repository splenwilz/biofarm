"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";

import { AnnotationNotes } from "@/components/AnnotationNotes";
import { BarTable } from "@/components/charts/BarTable";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { integer, monthLabel, pct } from "@/lib/format";
import { sessionsChange, trafficReport } from "@/lib/insights";
import { monthRange } from "@/lib/kpi";

export function TrafficPage() {
  const { data, annotations, addAnnotation, removeAnnotation } = useDashboard();
  const { report, provenance, filters, audience, config } = useReport();
  const t = useMemo(() => trafficReport(data.traffic, report.months, report.enquiriesByMonth), [data.traffic, report.months, report.enquiriesByMonth]);
  const month = monthLabel(report.reportMonth);
  const prevLabel = monthLabel(report.prevMonth);
  const prev = `vs ${prevLabel}`;
  const lastYear = monthLabel(monthRange(report.reportMonth, 13)[0]);
  const convPts = t.conversion !== null && t.conversionPrev !== null ? Math.round((t.conversion - t.conversionPrev) * 1000) / 10 : null;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Traffic"
        subtitle={`Website sessions and how many became enquiries · ${month}${filters.audience === "all" ? "" : ` · enquiries for ${audience.title.toLowerCase()}`}`}
        actions={<ExportButton filename={`biofarm-traffic-${report.months[0]}-to-${report.reportMonth}`} rows={() => report.months.map((m, i) => ({ month: m, sessions: t.sessionsByMonth[i], enquiries: report.enquiriesByMonth[i], conversion_pct: t.sessionsByMonth[i] ? Math.round((report.enquiriesByMonth[i] / t.sessionsByMonth[i]) * 1000) / 10 : null }))} />}
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-sessions"
            label="Sessions"
            value={integer(t.sessions)}
            delta={{ value: t.sessions - t.sessionsPrev, note: prev }}
            trend={t.sessionsByMonth}
            footnote="GA4 sessions, all channels"
            info={[`Website sessions in ${month}, every channel.`, [t.sessionsLastYear === null ? null : `${lastYear}: ${integer(t.sessionsLastYear)}`, provenance].filter(Boolean).join(" · ") + "."]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-visit-rate"
            label="Visit to enquiry rate"
            value={pct(t.conversion, 1)}
            delta={convPts === null ? undefined : { value: convPts, note: `pts ${prev}`, format: (v) => v.toFixed(1) }}
            footnote="Sessions that became an enquiry"
            info={[`Enquiries divided by sessions in ${month}.`, `${integer(report.headline.enquiries)} enquiries from ${integer(t.sessions)} sessions.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-biggest-channel"
            textValue
            label="Biggest channel"
            value={t.channels[0]?.name ?? "–"}
            compare={t.channels[0] ? `${pct(t.channels[0].share)} of sessions` : undefined}
            info={[`The channel with the most sessions in ${month}.`, `GA4 default channel grouping, with AI assistants split out${t.channels[0] ? ` · ${integer(t.channels[0].sessions)} sessions` : ""}.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard testId="kpi-paid-share" label="Paid share" value={pct(t.paidShare)} footnote="Paid search and paid social" info={`Paid channels as a share of all sessions in ${month}.`} />
        </Grid>
      </Grid>

      <Section id="sessions" title="Sessions by month" subtitle="All channels, last 12 months">
        <ColumnChart months={report.months} values={t.sessionsByMonth} label="Sessions by month" height={240} yAxisWidth={52} annotations={annotations} />
        {/* the overview chart's legend keeps its notes clear of the axis; this chart has none, so add the room */}
        <Box sx={{ pt: 3 }}>
          <AnnotationNotes months={report.months} notes={annotations} onAdd={addAnnotation} onRemove={removeAnnotation} />
        </Box>
      </Section>

      <Section id="channels" title={`Sessions by channel, ${month}`} subtitle="Bar length is the channel's sessions this month; the sparkline is its last 12 months" padded={false}>
        <BarTable
          ariaLabel={`Sessions by channel, ${month}`}
          labelHeader="Channel"
          barHeader="Sessions"
          columns={["Sessions", "Share", prev]}
          trendHeader="12 months"
          rows={t.channels.map((c) => ({ key: c.channel, label: c.name, total: c.sessions, cells: [integer(c.sessions), pct(c.share), sessionsChange(c.sessions, c.sessionsPrev, config.channelChangeMinSessions)], trend: c.byMonth, muted: c.sessions === 0 }))}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, py: 1.5 }}>
          Change is shown for channels with at least {integer(config.channelChangeMinSessions)} sessions.
        </Typography>
      </Section>
    </Stack>
  );
}
