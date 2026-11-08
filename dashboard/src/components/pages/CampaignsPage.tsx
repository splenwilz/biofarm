"use client";

import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";

import { BarTable } from "@/components/charts/BarTable";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { WAITING_FOR_SPEND } from "@/components/pages/OverviewPage";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { WindowToggle } from "@/components/WindowToggle";
import { gbp, integer, pct } from "@/lib/format";
import { campaignSummary, campaignTable, landingPages } from "@/lib/insights";
import { monthOf } from "@/lib/kpi";

const UNTAGGED = "Untracked";
/** Campaigns bidding on the company's own name, by the word "brand" in the campaign name as typed in the ad account. */
const BRAND = /\bbrand\b/i;
const BRAND_NOTE = "People searching for Biofarm by name, usually cheaper than other campaigns";

export function CampaignsPage() {
  const { data, spend } = useDashboard();
  const { report, config, audience, filters, provenance, period } = useReport();
  const months = report.trailingMonths;
  const window = period.window;
  const allAudiences = filters.audience === "all";
  const audienceNote =
    filters.audience === "all" ? "" : ` · ${audience.title.toLowerCase()}`;
  const enquiries = report.enquiries; // inbound, for the chosen audience
  const deals = useMemo(
    () =>
      filters.audience === "all"
        ? data.deals
        : data.deals.filter((d) => d.pipeline === filters.audience),
    [data.deals, filters.audience],
  );
  const campaigns = useMemo(
    () => campaignTable(enquiries, deals, spend, months, config),
    [enquiries, deals, spend, months, config],
  );
  const pages = useMemo(
    () => landingPages(enquiries, deals, months, config),
    [enquiries, deals, months, config],
  );
  const total = useMemo(
    () => enquiries.filter((e) => months.includes(monthOf(e.createdAt))).length,
    [enquiries, months],
  );
  const summary = useMemo(
    () => campaignSummary(campaigns, total, config.bestValueMinQualified),
    [campaigns, total, config.bestValueMinQualified],
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Campaigns"
        subtitle={`What each campaign cost and produced · ${window} · ${audience.detail}`}
        actions={
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <WindowToggle />
            <ExportButton
              filename={`biofarm-campaigns-${months[0]}-to-${report.reportMonth}`}
              rows={() =>
                campaigns.map((c) => ({
                  campaign: c.campaign,
                  spend_gbp: c.spendGbp,
                  enquiries: c.enquiries,
                  cost_per_enquiry_gbp:
                    c.costPerEnquiry === null
                      ? null
                      : Math.round(c.costPerEnquiry * 100) / 100,
                  qualified: c.qualified,
                  cost_per_qualified_gbp: c.cpqo,
                }))
              }
            />
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-media-spend"
            label="Media spend"
            value={gbp(summary.spendGbp)}
            detail={`${integer(summary.paidCampaigns)} ${summary.paidCampaigns === 1 ? "campaign" : "campaigns"} with spend`}
            info={`Spend entered on the Media spend page, ${window}.`}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-campaign-enquiries"
            label="Enquiries from campaigns"
            value={integer(summary.taggedEnquiries)}
            detail={`${pct(summary.taggedShare)} of ${integer(total)} enquiries`}
            info={[`Enquiries whose website record carries a UTM campaign, ${window}${audienceNote}.`, `${provenance}.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-campaign-cpqo"
            label="Cost per qualified"
            value={gbp(summary.cpqo)}
            compare={summary.spendGbp === 0 ? WAITING_FOR_SPEND : undefined}
            detail={summary.spendGbp === 0 ? undefined : `${integer(summary.paidQualified)} qualified from paid campaigns`}
            info={[`Spend on tagged campaigns divided by the qualified enquiries those campaigns produced, ${window}.`, `${integer(summary.qualified)} qualified across all tagged campaigns, including unpaid ones.`]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-best-value"
            textValue
            label="Best value"
            value={summary.bestValue?.campaign ?? "Not enough data yet"}
            detail={summary.bestValue ? `${gbp(summary.bestValue.cpqo)} per qualified · ${integer(summary.bestValue.qualified)} qualified` : undefined}
            footnote={`Minimum ${integer(config.bestValueMinQualified)} qualified in the period`}
            info={`Lowest cost per qualified among campaigns with spend and at least ${integer(config.bestValueMinQualified)} qualified enquiries, ${window}.`}
          />
        </Grid>
      </Grid>

      <Section
        id="campaigns"
        title="Campaign performance"
        subtitle={`Bar length is enquiries; the darker part qualified · spend joins website records on the campaign name as typed · ${window}${audienceNote}`}
        info="Enquiries without a UTM campaign are listed last as Untracked, with no bar, so campaign bars compare only with each other. Spend is not split by audience, so the cost columns are shown for all audiences only."
        padded={false}
      >
        <BarTable
          ariaLabel="Campaign performance"
          labelHeader="Campaign"
          barHeader="Enquiries"
          columns={allAudiences ? ["Spend", "Enquiries", "Cost per enquiry", "Qualified", "Cost per qualified"] : ["Spend", "Enquiries", "Qualified"]}
          rows={campaigns.map((c) => ({
            key: c.campaign,
            label: c.campaign,
            sublabel: BRAND.test(c.campaign) ? BRAND_NOTE : undefined,
            total:
              c.campaign === UNTAGGED ? 0 : Math.max(c.enquiries, c.qualified),
            fill: c.qualified,
            cells: allAudiences
              ? [c.spendGbp ? gbp(c.spendGbp) : "–", integer(c.enquiries), c.costPerEnquiry === null ? "–" : gbp(c.costPerEnquiry), integer(c.qualified), c.cpqo === null ? "–" : gbp(c.cpqo)]
              : [c.spendGbp ? gbp(c.spendGbp) : "–", integer(c.enquiries), integer(c.qualified)],
            muted: c.campaign === UNTAGGED,
          }))}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", px: 2, py: 1.5 }}
        >
          {allAudiences ? "Untracked enquiries are listed last without a bar." : "Cost shown for all audiences only."}
        </Typography>
      </Section>

      <Section
        id="pages"
        title={`Enquiries by landing page, ${window}`}
        subtitle={`Where enquiries were made; the darker part qualified${audienceNote}`}
        padded={false}
      >
        <BarTable
          ariaLabel="Enquiries by landing page"
          labelHeader="Page"
          barHeader="Enquiries"
          columns={["Enquiries", "Qualified", "Conversion"]}
          rows={pages.map((p) => ({
            key: p.page,
            label: p.page,
            total: Math.max(p.enquiries, p.qualified),
            fill: p.qualified,
            cells: [
              integer(p.enquiries),
              integer(p.qualified),
              p.conversionBase >= config.pageConversionMinEnquiries ? pct(p.conversion) : "–",
            ],
          }))}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, py: 1.5 }}>
          {`Conversion is shown for pages with at least ${integer(config.pageConversionMinEnquiries)} enquiries.`}
        </Typography>
      </Section>
    </Stack>
  );
}
