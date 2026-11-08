"use client";

import Stack from "@mui/material/Stack";

import { CohortHeatmap } from "@/components/charts/CohortHeatmap";
import { ExportButton } from "@/components/ExportButton";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { monthLabel, pct } from "@/lib/format";

export function CohortsPage() {
  const { report, config, provenance } = useReport();
  const horizon = config.cohortHorizonsDays[config.cohortHorizonsDays.length - 1];
  const mature = report.cohorts.filter((c) => c.mature);
  const shares = mature.map((c) => (c.base ? (c.qualifiedBy[horizon] ?? 0) / c.base : 0));
  const avgShare = shares.length ? shares.reduce((s, v) => s + v, 0) / shares.length : null;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Enquiry to qualified"
        subtitle={`What share of each month's enquiries became a qualified opportunity within ${config.cohortHorizonsDays.join(", ")} days · ${monthLabel(report.months[0])} to ${monthLabel(report.reportMonth)} · all audiences`}
        actions={
          <ExportButton
            filename={`biofarm-cohorts-${report.months[0]}-to-${report.reportMonth}`}
            rows={() =>
              report.cohorts.map((c) => ({
                enquiry_month: c.month,
                enquiries: c.enquiries,
                ...Object.fromEntries(config.cohortHorizonsDays.map((d) => [`qualified_within_${d}_days`, c.qualifiedBy[d] ?? 0])),
                mature: c.mature ? "yes" : "no",
              }))
            }
          />
        }
      />
      <Section
        id="cohorts"
        title="Enquiry-month cohorts"
        subtitle={`${avgShare === null ? "No mature cohorts yet" : `Mature months average ${pct(avgShare)} within ${horizon} days`} · a month is still maturing until ${config.cohortMaturityDays} days after it ends · ${provenance}`}
      >
        <CohortHeatmap rows={[...report.cohorts].reverse()} horizons={config.cohortHorizonsDays} minEnquiries={config.qualifiedShareMinEnquiries} />
      </Section>
    </Stack>
  );
}
