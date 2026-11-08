"use client";

import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";

import { BarTable, type BarTableRow } from "@/components/charts/BarTable";
import { OutcomeBars } from "@/components/charts/OutcomeBars";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { conversionText, WAITING_FOR_SPEND } from "@/components/pages/OverviewPage";
import { useReport } from "@/components/pages/useReport";
import { WindowToggle } from "@/components/WindowToggle";
import { gbp, integer, monthName, pct, windowLabel } from "@/lib/format";
import { enquiriesByForm, outcomesBySource } from "@/lib/insights";
import { paidSummary, type PlatformRow } from "@/lib/kpi";

/** The cost column: blank for unpaid sources, "–" for paid ones with nothing to divide, else the cost. */
function costText(r: Pick<PlatformRow, "spendGbp" | "cpqo">): string {
  if (r.spendGbp === null) return "";
  return r.cpqo === null ? "–" : gbp(r.cpqo);
}

export function SourcesPage() {
  const { report, config, audience, filters, period } = useReport();
  const { data } = useDashboard();
  const window = period.window;
  const audienceNote =
    filters.audience === "all" ? "" : ` · ${audience.title.toLowerCase()}`;

  const forms = useMemo(
    () => enquiriesByForm(report.enquiries, report.trailingMonths),
    [report.enquiries, report.trailingMonths],
  );
  const outcomes = useMemo(
    () =>
      outcomesBySource(
        filters.audience === "all"
          ? data.deals
          : data.deals.filter((d) => d.pipeline === filters.audience),
        report.months,
        config,
      ),
    [data.deals, filters.audience, report.months, config],
  );

  const totalEnquiries = report.sources.reduce((s, r) => s + r.enquiries, 0);
  const totalQualified = report.sources.reduce((s, r) => s + r.qualified, 0);
  const totalBase = report.sources.reduce((s, r) => s + r.conversionBase, 0);
  const totalFromLeads = report.sources.reduce((s, r) => s + r.qualifiedFromLeads, 0);
  const formTotal = forms.reduce((s, f) => s + f.count, 0);
  const paid = paidSummary(report.sources);
  const minEnquiries = config.bestConvertingMinEnquiries;
  const bestOf = (rows: typeof report.sources) => [...rows].filter((r) => r.conversionBase >= minEnquiries && r.conversion !== null && r.conversion <= 1).sort((a, b) => (b.conversion ?? 0) - (a.conversion ?? 0))[0];
  const bestConverting = bestOf(report.sources);
  const bestConvertingPrev = bestOf(report.sourcesPrev);
  const prevEnquiries = report.sourcesPrev.reduce((s, r) => s + r.enquiries, 0);
  const paidPrev = paidSummary(report.sourcesPrev);
  const prevWindow = filters.window === 1 ? monthName(report.prevTrailingMonths[0]) : windowLabel(report.prevTrailingMonths);
  const vsPrev = `vs ${prevWindow}`;

  const sourceRows: BarTableRow[] = report.sources.map((r) => ({
    key: r.group,
    label: r.group,
    total: Math.max(r.enquiries, r.qualified),
    fill: r.qualified,
    cells: [
      integer(r.enquiries),
      integer(r.qualified),
      conversionText(r, config.qualifiedShareMinEnquiries),
      costText(r),
    ],
    muted: r.enquiries === 0 && r.qualified === 0,
    children: r.platforms.map((p) => ({
      key: `${r.group}/${p.platform}`,
      label: p.platform,
      total: Math.max(p.enquiries, p.qualified),
      fill: p.qualified,
      cells: [
        integer(p.enquiries),
        integer(p.qualified),
        conversionText(p, config.qualifiedShareMinEnquiries),
        costText(p),
      ],
    })),
  }));

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Sources"
        subtitle={`Where enquiries came from and how many qualified · ${window} · ${audience.detail}`}
        actions={
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <WindowToggle />
            <ExportButton
              filename={`biofarm-sources-${report.trailingMonths[0]}-to-${report.reportMonth}${filters.audience === "all" ? "" : `-${filters.audience}`}`}
              rows={() =>
                report.sources.flatMap((r) => [
                  {
                    source_group: r.group,
                    platform: "",
                    enquiries: r.enquiries,
                    qualified: r.qualified,
                    conversion_pct:
                      r.conversion === null
                        ? null
                        : Math.round(r.conversion * 1000) / 10,
                    spend_gbp: r.spendGbp,
                    cost_per_qualified_gbp:
                      r.cpqo === null ? null : Math.round(r.cpqo * 100) / 100,
                  },
                  ...r.platforms.map((p) => ({
                    source_group: r.group,
                    platform: p.platform,
                    enquiries: p.enquiries,
                    qualified: p.qualified,
                    conversion_pct:
                      p.conversion === null
                        ? null
                        : Math.round(p.conversion * 1000) / 10,
                    spend_gbp: p.spendGbp,
                    cost_per_qualified_gbp:
                      p.cpqo === null ? null : Math.round(p.cpqo * 100) / 100,
                  })),
                ])
              }
            />
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-source-enquiries"
            label="Enquiries"
            value={integer(totalEnquiries)}
            delta={{ value: totalEnquiries - prevEnquiries, note: vsPrev }}
            info={[`Inbound enquiries, ${window}${audienceNote}: Pipedrive leads and directly created deals on an inbound source channel.`, `${integer(totalQualified)} qualified · ${pct(totalBase >= config.qualifiedShareMinEnquiries ? totalFromLeads / totalBase : null)} of lead enquiries.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-paid-share"
            label="Paid share"
            value={pct(paid.share)}
            delta={paid.share !== null && paidPrev.share !== null ? { value: Math.round((paid.share - paidPrev.share) * 100), note: `pts ${vsPrev}`, format: (v) => v.toFixed(0) } : undefined}
            info={[`Share of enquiries from paid search and LinkedIn ads, ${window}.`, `${integer(paid.enquiries)} of ${integer(totalEnquiries)} enquiries.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-paid-cpqo"
            label="Paid cost per qualified"
            value={gbp(paid.cpqo)}
            compare={paid.spendGbp === 0 ? WAITING_FOR_SPEND : undefined}
            delta={paid.cpqo !== null && paidPrev.cpqo !== null ? { value: Math.round(paid.cpqo - paidPrev.cpqo), note: vsPrev, betterWhen: "down", format: (v) => gbp(v) } : undefined}
            info={[`Paid search and LinkedIn ad spend ÷ the qualified enquiries they produced, ${window}.`, `${gbp(paid.spendGbp)} spend · ${integer(paid.qualified)} qualified.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-best-converting"
            textValue
            label="Best converting"
            value={bestConverting?.group ?? "–"}
            compare={bestConverting ? `${pct(bestConverting.conversion)} of ${integer(bestConverting.conversionBase)} qualified` : `No source reached ${integer(minEnquiries)} enquiries`}
            info={[`Highest qualified share among sources with at least ${integer(minEnquiries)} enquiries, ${window}${audienceNote}.`, `${prevWindow}: ${bestConvertingPrev?.group ?? "none reached the minimum"}.`]}
          />
        </Grid>
      </Grid>

      <Section
        id="by-source"
        title="Enquiries by source"
        subtitle={`Bar length is enquiries; the darker part qualified · open a group to see its platforms · ${window}${audienceNote}`}
        info="Enquiries with a website record are grouped from their source and medium: click IDs and paid mediums as paid search or LinkedIn ads, search engines and referring sites by referrer. Everything else uses the Pipedrive source channel. Deals Sales created by hand show as Sales-created where they outnumber the enquiries that preceded them. Cost per qualified is the window's spend on a paid source divided by its qualified opportunities. Outbound / network records (Campaigns / Outreach, Existing Network, Introducer) are not marketing's number and are left out."
        padded={false}
      >
        <BarTable
          ariaLabel="Enquiries by source"
          labelHeader="Source"
          barHeader=""
          barWidth="30%"
          columns={[
            "Enquiries",
            "Qualified",
            "Conversion",
            "Cost per qualified",
          ]}
          rows={sourceRows}
          childNoun="platforms"
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", px: 2, py: 1.5 }}
        >
          Cost per qualified is shown for paid sources only.
        </Typography>
      </Section>

      <Section
        id="by-form"
        title="Enquiries by form"
        subtitle={`${window}${audienceNote}`}
        padded={false}
      >
        <BarTable
          ariaLabel="Enquiries by form"
          labelHeader="Form"
          barHeader=""
          columns={["Enquiries", "Share"]}
          rows={forms.map((f) => ({
            key: f.form,
            label: f.label,
            total: f.count,
            fill: f.count,
            cells: [
              integer(f.count),
              pct(formTotal ? f.count / formTotal : null),
            ],
          }))}
        />
      </Section>

      <Section
        id="outcomes"
        title="Outcome of qualified enquiries by source"
        subtitle={`Won, still open and lost, by source group · last 12 months${audienceNote}`}
      >
        <OutcomeBars rows={outcomes} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          Deal outcomes are managed by Sales, shown for context.
        </Typography>
      </Section>
    </Stack>
  );
}
