"use client";

import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { cpdReport } from "@/lib/cpd";
import { integer, monthLabel } from "@/lib/format";

/**
 * CPD session bookings: the "Arrange a session" form on the BNG CPD page,
 * read from Pipedrive leads. Their own line since 26 Nov 2026, never part of
 * the enquiry figures. Google Ads counts them separately through the
 * agency's tag, so this page reads nothing from Ads or GA4.
 */
export function CpdPage() {
  const { data } = useDashboard();
  const { report, provenance } = useReport();
  const c = cpdReport(data.cpdBookings, report.months);
  const month = monthLabel(report.reportMonth);
  const window = `${monthLabel(report.months[0])} to ${month}`;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="CPD bookings"
        subtitle={`CPD session requests through the website · ${window} · not counted as enquiries`}
        actions={<ExportButton filename={`biofarm-cpd-bookings-${report.months[0]}-to-${report.reportMonth}`} rows={() => report.months.map((m, i) => ({ month: m, bookings: c.byMonth[i] }))} />}
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <KpiCard
            testId="kpi-cpd-month"
            label={`Bookings in ${month}`}
            value={integer(c.thisMonth)}
            delta={{ value: c.thisMonth - c.prevMonth, note: `vs ${monthLabel(report.prevMonth)}` }}
            trend={c.byMonth}
            info={[`"Arrange a session" requests from the BNG CPD page in ${month}, as Pipedrive leads titled "CPD session request".`, `Test and staff submissions are left out, as for enquiries. ${provenance}.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <KpiCard
            testId="kpi-cpd-window"
            label="Bookings in the window"
            value={integer(c.total)}
            compare={c.firstMonth ? `first booking ${monthLabel(c.firstMonth)}` : "none yet"}
            info={[`All CPD session requests, ${window}.`, "The CPD page went live on 6 October 2026, so earlier months are empty by design."]}
          />
        </Grid>
      </Grid>

      <Section id="cpd-by-month" title="CPD bookings by month" subtitle="One column per month · a training booking is not a BNG enquiry, so these never appear in the enquiry figures">
        <ColumnChart months={report.months} values={c.byMonth} label="CPD bookings by month" height={220} yAxisWidth={52} />
      </Section>

      <Section id="cpd-tracking" title="Where the number comes from" subtitle="Pipedrive only">
        <Stack spacing={1} sx={{ px: 2, pb: 2, fontSize: 14, color: "text.secondary" }}>
          <span>Each booking is the lead our CPD form creates in Pipedrive. The dashboard counts those leads by the month they came in.</span>
          <span>Google Ads and Microsoft Ads count CPD bookings separately through the agency&apos;s tag manager. This page does not read those, so a booking is never counted twice here.</span>
        </Stack>
      </Section>
    </Stack>
  );
}
