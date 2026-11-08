"use client";

import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

import { BarTable } from "@/components/charts/BarTable";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { JoinedLeftChart } from "@/components/charts/JoinedLeftChart";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { newsletterReport } from "@/lib/channels";
import { dateLabel, integer, monthLabel, pct, signed } from "@/lib/format";
import { monthRange } from "@/lib/kpi";

function points(a: number | null | undefined, b: number | null | undefined): number | null {
  return a === null || a === undefined || b === null || b === undefined ? null : Math.round((a - b) * 100);
}

export function NewsletterPage() {
  const { data } = useDashboard();
  const { report, provenance } = useReport();
  const n = newsletterReport(data.newsletter, report.months);
  const month = monthLabel(report.reportMonth);
  const lastYear = monthLabel(monthRange(report.reportMonth, 13)[0]);
  const openDelta = points(n.lastIssue?.openRate, n.previousIssue?.openRate);
  const clickDelta = points(n.lastIssue?.clickRate, n.previousIssue?.clickRate);
  const net = n.added - n.removed;
  const window = `${monthLabel(report.months[0])} to ${month}`;
  const issueLine = n.lastIssue ? `"${n.lastIssue.subject}" · sent ${dateLabel(n.lastIssue.sentAt)}` : "No issue in this window";

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Newsletter"
        subtitle={`Subscribers and how each issue performed · ${window}`}
        actions={
          <ExportButton
            filename={`biofarm-newsletter-${report.months[0]}-to-${report.reportMonth}`}
            rows={() => [...n.issues].reverse().map((i) => ({ sent: i.sentAt.slice(0, 10), subject: i.subject, recipients: i.recipients, opens: i.opens, clicks: i.clicks, unsubscribes: i.unsubscribes, open_rate_pct: Math.round(i.openRate * 1000) / 10, click_rate_pct: Math.round(i.clickRate * 1000) / 10 }))}
          />
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-subscribers"
            label="Subscribers"
            value={integer(n.subscribers)}
            delta={{ value: n.subscribers - n.subscribersPrev, note: `vs ${monthLabel(report.prevMonth)}` }}
            trend={n.subscribersByMonth}
            info={[`Pipedrive persons marked subscribed at the end of ${month}.`, [n.subscribersLastYear === null ? null : `${lastYear}: ${integer(n.subscribersLastYear)}`, provenance].filter(Boolean).join(" · ") + "."]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-net-growth"
            label="Net growth, 12 months"
            value={signed(net)}
            compare={`${integer(n.added)} joined, ${integer(n.removed)} left`}
            info={[`People who joined minus people who left, ${window}.`, n.unsubscribeRate === null ? "No issues sent in the window." : `${pct(n.unsubscribeRate, 1)} of recipients unsubscribed across the window's issues.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-click-rate"
            label="Click rate, last issue"
            value={pct(n.lastIssue?.clickRate ?? null)}
            delta={clickDelta === null ? undefined : { value: clickDelta, note: "pts vs previous issue" }}
            footnote={issueLine}
            info={["Clicks ÷ recipients for the last issue sent.", [n.lastIssue ? `${integer(n.lastIssue.clicks)} clicks from ${integer(n.lastIssue.recipients)} recipients` : null, n.avgClickRate === null ? null : `12-month average ${pct(n.avgClickRate)}`].filter(Boolean).join(" · ") + "."]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-open-rate"
            label="Open rate, last issue"
            value={pct(n.lastIssue?.openRate ?? null)}
            delta={openDelta === null ? undefined : { value: openDelta, note: "pts vs previous issue" }}
            footnote={issueLine}
            info={["Opens ÷ recipients for the last issue sent.", [n.lastIssue ? `${integer(n.lastIssue.opens)} opens from ${integer(n.lastIssue.recipients)} recipients` : null, n.avgOpenRate === null ? null : `12-month average ${pct(n.avgOpenRate)}`].filter(Boolean).join(" · ") + ".", "Opens are inflated by Apple Mail privacy features. Use click rate as the main measure."]}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section id="subscribers" title="Subscribers by month" subtitle="Subscribed persons at month end">
            <ColumnChart months={report.months} values={n.subscribersByMonth} label="Subscribers by month" height={220} yAxisWidth={52} />
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section id="net-adds" title="Joined and left by month" subtitle="People who joined above the line, people who left below it · the number is the net change">
            <JoinedLeftChart months={report.months} joined={n.addedByMonth} left={n.removedByMonth} label="Joined and left by month" height={220} yAxisWidth={52} />
          </Section>
        </Grid>
      </Grid>

      <Section id="signups" title="Sign-ups through the website" subtitle={`Newsletter sign-up forms submitted each month · ${integer(n.signups)} in the window · not counted as enquiries`}>
        <ColumnChart months={report.months} values={n.signupsByMonth} label="Sign-ups through the website" height={200} yAxisWidth={52} />
      </Section>

      <Section id="issues" title="Issues" subtitle="Newest first · the bar is the recipient list: the light part opened, the darker part clicked" padded={false}>
        <BarTable
          ariaLabel="Newsletter issues"
          labelHeader="Subject"
          barHeader="Opened"
          barWidth="30%"
          max={1}
          columns={["Open rate", "Click rate", "Unsubscribed"]}
          rows={n.issues.map((i) => ({
            key: i.id,
            label: i.subject,
            sublabel: `${dateLabel(i.sentAt)} · ${integer(i.recipients)} recipients`,
            total: i.openRate,
            fill: i.clickRate,
            cells: [`${pct(i.openRate)} · ${integer(i.opens)} opens`, `${pct(i.clickRate)} · ${integer(i.clicks)} clicks`, integer(i.unsubscribes)],
          }))}
          emptyText="No issues sent in this window."
        />
      </Section>
    </Stack>
  );
}
