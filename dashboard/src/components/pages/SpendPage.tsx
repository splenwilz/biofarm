"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { useRef, useState } from "react";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { MeterList } from "@/components/charts/MeterList";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { WAITING_FOR_SPEND } from "@/components/pages/OverviewPage";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Icon } from "@/components/shell/icons";
import { SpendDialog } from "@/components/SpendDialog";
import { SpendImport, type ImportResult } from "@/components/SpendImport";
import { SpendPanel } from "@/components/SpendPanel";
import { useReport } from "@/components/pages/useReport";
import { WindowToggle } from "@/components/WindowToggle";
import { gbp, integer, monthLabel, PLATFORM_LABEL, pct } from "@/lib/format";
import { feedCovers, splitByFeedCoverage } from "@/lib/spendMerge";
import type { SpendEntry, SpendPlatform } from "@/lib/types";

export function SpendPage() {
  const { data, spend, addSpend, removeSpend, importSpend, canEdit } = useDashboard();
  const { report, config, period } = useReport();
  const [adding, setAdding] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const skippedByFeed = useRef<string[]>([]);

  const coveredMessage = (platform: SpendPlatform, month: string) => `${PLATFORM_LABEL[platform]} for ${monthLabel(month)} comes from the feed, so the line was skipped.`;
  const addUnlessFed = (entry: Omit<SpendEntry, "id">) => {
    if (feedCovers(data.spend, entry)) {
      setImported({ added: 0, errors: [coveredMessage(entry.platform, entry.month)] });
      return;
    }
    addSpend(entry);
  };
  const importUnlessFed = (entries: Omit<SpendEntry, "id">[]) => {
    const { kept, skipped } = splitByFeedCoverage<Omit<SpendEntry, "id">>(data.spend, entries);
    skippedByFeed.current = skipped.map((e) => coveredMessage(e.platform, e.month));
    if (kept.length) importSpend(kept);
  };
  const reportImport = (result: ImportResult) => {
    const skipped = skippedByFeed.current;
    skippedByFeed.current = [];
    setImported({ added: result.added - skipped.length, errors: [...result.errors, ...skipped] });
  };
  const h = report.headline;
  const month = monthLabel(report.reportMonth);
  const prev = `vs ${monthLabel(report.prevMonth)}`;
  const cpqoTrend = report.cpqoByMonth.every((v) => v !== null) ? (report.cpqoByMonth as number[]) : undefined;

  const exportRows = () =>
    spend
      .filter((e) => report.months.includes(e.month))
      .sort((a, b) => a.month.localeCompare(b.month) || a.platform.localeCompare(b.platform))
      .map((e) => ({ month: e.month, platform: PLATFORM_LABEL[e.platform], campaign: e.campaign, amount_gbp: e.amountGbp }));

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Media spend"
        subtitle="Campaign and media spend only, never team cost. Google Ads comes from the account each day; Microsoft and LinkedIn are entered by hand or imported from the agency's CSV."
        actions={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            {canEdit && (
              <Button variant="outlined" color="inherit" onClick={() => setAdding(true)} startIcon={<Icon name="plus" size={16} />} data-print="hide" sx={{ height: 40, borderColor: "divider", fontWeight: 500, whiteSpace: "nowrap" }}>
                Add spend
              </Button>
            )}
            {canEdit && <SpendImport months={report.months} onImport={importUnlessFed} onResult={reportImport} />}
            <ExportButton filename={`biofarm-media-spend-${report.months[0]}-to-${report.reportMonth}`} rows={exportRows} />
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            label={`Spend, ${month}`}
            value={gbp(h.spendMonth)}
            delta={{ value: Math.round(h.spendMonth - h.spendPrev), note: prev, betterWhen: "down", format: (v) => gbp(v) }}
            trend={report.spendRows.map((r) => r.spendGbp)}
            footnote="All platforms, entered by hand"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            testId="kpi-spend-cpqo"
            label="Cost per qualified opportunity"
            value={gbp(h.cpqoMonth)}
            compare={h.spendMonth === 0 ? WAITING_FOR_SPEND : undefined}
            delta={h.cpqoMonth !== null && h.cpqoPrev !== null ? { value: Math.round(h.cpqoMonth - h.cpqoPrev), note: prev, betterWhen: "down", format: (v) => gbp(v) } : undefined}
            trend={cpqoTrend}
            footnote={h.cpqoMonth === null ? `${month} · no qualified inbound opportunity yet to set the spend against` : `${gbp(h.spendMonth)} of spend brought ${integer(h.qualified)} qualified inbound ${h.qualified === 1 ? "opportunity" : "opportunities"} in ${month}`}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            testId="kpi-cpqo-trailing"
            label={`Trailing ${config.trailingMonths}-month cost per qualified opportunity`}
            value={gbp(h.cpqoTrailing)}
            compare={report.spendRows.slice(-config.trailingMonths).every((r) => r.spendGbp === 0) ? WAITING_FOR_SPEND : undefined}
            footnote="One month is noisy; this is the steadier figure"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Section
            id="platforms"
            title={`By platform, ${period.window}`}
            subtitle="Spend, and what it produced: opportunities whose source names that platform"
            info={`Cost per qualified is shown once a platform has at least ${integer(config.platformCpqoMinQualified)} qualified opportunities in the period; below that it reads "–".`}
            action={<WindowToggle />}
          >
            <MeterList
              ariaLabel={`Spend by platform, ${period.window}`}
              rows={report.spendByPlatform.map((p) => ({
                key: p.platform,
                label: p.label,
                value: p.amountGbp,
                valueText: gbp(p.amountGbp),
                fill: p.amountGbp,
                fillText: `${pct(p.share)} of spend · ${integer(p.qualified)} qualified · cost per qualified ${p.qualified < config.platformCpqoMinQualified ? "–" : gbp(p.cpqo)}`,
              }))}
              emptyText="No spend entered for this period yet."
            />
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Section id="spend-by-month" title="Spend by month" subtitle="All platforms, last 12 months">
            <ColumnChart months={report.months} values={report.spendRows.map((r) => r.spendGbp)} label="Spend by month" format={(v) => gbp(v)} height={220} yAxisWidth={64} />
          </Section>
        </Grid>
      </Grid>

      <Section id="spend-entry" title="Review spend" subtitle="One line per platform and campaign. Google Ads and Microsoft Ads from Amanda's monthly report, LinkedIn from the campaign manager.">
        <Stack spacing={2.5}>
          {imported && (
            <Alert severity={imported.errors.length ? (imported.added ? "warning" : "error") : "success"} onClose={() => setImported(null)} role="status">
              {imported.added} {imported.added === 1 ? "line" : "lines"} imported.
              {imported.errors.length > 0 && (
                <>
                  {" "}
                  {imported.errors.length} skipped:
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {imported.errors.slice(0, 5).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {imported.errors.length > 5 && <li>and {imported.errors.length - 5} more</li>}
                  </ul>
                </>
              )}
            </Alert>
          )}
          <SpendPanel months={report.months} entries={spend} onRemove={canEdit ? removeSpend : undefined} />
        </Stack>
      </Section>
      {adding && (
        <SpendDialog
          open
          months={report.months}
          onClose={() => setAdding(false)}
          onAdd={(entry) => {
            addUnlessFed(entry);
            setAdding(false);
          }}
        />
      )}
    </Stack>
  );
}
