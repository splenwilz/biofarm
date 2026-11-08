"use client";

import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { MeterList } from "@/components/charts/MeterList";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { PageHeader } from "@/components/PageHeader";
import { TrendChart } from "@/components/TrendChart";
import { sourceMeters, WAITING_FOR_SPEND } from "@/components/pages/OverviewPage";
import { useReport } from "@/components/pages/useReport";
import { Icon } from "@/components/shell/icons";
import { dateLabel, gbp, integer, monthLabel } from "@/lib/format";
import { summaryText } from "@/lib/insights";

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.15 }}>{value}</Typography>
      {note && (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * The month on one page. Email delivery is deliberately not offered yet: the report is reviewed
 * before anyone sends it, so the actions are copy, print and export only. The schedule settings
 * stay in the provider for when that changes.
 */
export function ReportPage() {
  const { annotations } = useDashboard();
  const { report, config, provenance, data, period } = useReport();
  const [copied, setCopied] = useState(false);
  const h = report.headline;
  const month = monthLabel(report.reportMonth);
  const text = summaryText(report, config);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Monthly report"
        subtitle={`${month} on one page, for the last-Thursday meeting. Print it, copy the summary into Teams, or download the numbers.`}
        actions={
          <Stack direction="row" spacing={1} data-print="hide">
            <Button variant="outlined" color="inherit" size="small" onClick={copy} startIcon={<Icon name="clipboard" size={16} />} sx={{ borderColor: "divider", fontWeight: 500 }}>
              {copied ? "Copied" : "Copy summary"}
            </Button>
            <Button variant="outlined" color="inherit" size="small" onClick={() => window.print()} startIcon={<Icon name="printer" size={16} />} sx={{ borderColor: "divider", fontWeight: 500 }}>
              Print / PDF
            </Button>
            <ExportButton filename={`biofarm-marketing-report-${report.reportMonth}`} rows={() => report.months.map((m, i) => ({ month: m, qualified_inbound: report.trend[i].inbound, network: report.trend[i].network, enquiries: report.enquiriesByMonth[i], spend_gbp: report.spendRows[i].spendGbp, cost_per_qualified_gbp: report.cpqoByMonth[i] }))} />
          </Stack>
        }
      />

      <Paper component="article" aria-label={`Marketing report, ${month}`} sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 1 }}>
            <Typography variant="h1" component="h2">
              Marketing, {month}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {provenance} · prepared {dateLabel(data.syncedAt)}
            </Typography>
          </Stack>

          <Grid container spacing={3}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure label="Qualified inbound opportunities" value={integer(h.qualified)} note={`target ${config.targetQualifiedPerMonth} · ${h.qualifiedDelta >= 0 ? "+" : ""}${h.qualifiedDelta} vs ${monthLabel(report.prevMonth)} · trailing avg ${h.trailingAvg.toFixed(1)}`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure label="Cost per qualified opportunity" value={gbp(h.cpqoMonth)} note={h.spendMonth === 0 ? WAITING_FOR_SPEND : `trailing ${config.trailingMonths} months ${gbp(h.cpqoTrailing)} · spend ${gbp(h.spendMonth)}`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure label="Inbound enquiries" value={integer(h.enquiries)} note={`${h.enquiries - h.enquiriesPrev >= 0 ? "+" : ""}${h.enquiries - h.enquiriesPrev} vs ${monthLabel(report.prevMonth)}`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure label="Same month last year" value={h.qualifiedLastYear === null ? "–" : integer(h.qualifiedLastYear)} note={h.enquiriesLastYear === null ? undefined : `${integer(h.enquiriesLastYear)} enquiries · ${gbp(h.cpqoLastYear)} per qualified`} />
            </Grid>
          </Grid>

          <TrendChart rows={report.trend} target={config.targetQualifiedPerMonth} annotations={annotations} />

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h2" component="h3" sx={{ mb: 1.5 }}>
                Top sources, {period.window}
              </Typography>
              <MeterList ariaLabel="Top sources" rows={sourceMeters(report.sources.slice(0, 5), config.qualifiedShareMinEnquiries)} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h2" component="h3" sx={{ mb: 1.5 }}>
                In words
              </Typography>
              <Typography variant="body2" component="pre" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", m: 0, lineHeight: 1.7 }}>
                {text}
              </Typography>
            </Grid>
          </Grid>
        </Stack>
      </Paper>
    </Stack>
  );
}
