"use client";

import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { MeterList } from "@/components/charts/MeterList";
import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { searchReport } from "@/lib/channels";
import { integer, monthLabel, pct } from "@/lib/format";

export function SearchPage() {
  const { data, config } = useDashboard();
  const { report, provenance } = useReport();
  const s = searchReport(data.search, report.months);
  const month = monthLabel(report.reportMonth);
  const prev = `vs ${monthLabel(report.prevMonth)}`;
  const mentionPts = s.aiMentionShare !== null && s.aiMentionSharePrev !== null ? Math.round((s.aiMentionShare - s.aiMentionSharePrev) * 100) : null;
  const mentionTarget = Math.round(config.aiMentionShareTarget * 100);

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Search & AI"
        subtitle={`How often Biofarm is searched for by name, and how often AI assistants send people to the site · ${month}`}
        actions={
          <ExportButton
            filename={`biofarm-search-ai-${report.months[0]}-to-${report.reportMonth}`}
            rows={() => report.months.map((m, i) => ({ month: m, brand_search_impressions: s.brandByMonth[i], ai_referral_sessions: s.aiByMonth[i], ai_mention_share_pct: (() => { const v = data.search.months.find((r) => r.month === m)?.aiMentionShare; return v === null || v === undefined ? null : Math.round(v * 100); })() }))}
          />
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            testId="kpi-brand"
            label="Brand searches"
            value={integer(s.brandImpressions)}
            delta={{ value: s.brandImpressions - s.brandImpressionsPrev, note: prev }}
            trend={s.brandByMonth}
            detail={`${integer(s.brandClicks)} clicks through to the site`}
            progress={{ value: s.brandImpressions, target: config.brandSearchTargetPerMonth }}
            footnote={`Search Console impressions for queries naming Biofarm · ${provenance}`}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            label="AI referral sessions"
            value={integer(s.aiSessions)}
            delta={{ value: s.aiSessions - s.aiSessionsPrev, note: prev }}
            trend={s.aiByMonth}
            detail={s.assistants[0] ? `${s.assistants[0].assistant} sends the most` : undefined}
            footnote={`GA4 sessions referred by AI assistants · ${provenance}`}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard
            label="AI mention share"
            value={pct(s.aiMentionShare)}
            delta={mentionPts === null ? undefined : { value: mentionPts, note: `pts ${prev}` }}
            progress={s.aiMentionShare === null ? undefined : { value: Math.round(s.aiMentionShare * 100), target: mentionTarget, label: `${pct(s.aiMentionShare)} of target ${mentionTarget}%` }}
            footnote={`Share of sampled BNG prompts whose answer names Biofarm · ${provenance}`}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Section id="brand" title="Brand searches by month" subtitle={`Impressions for queries naming Biofarm, against the target of ${config.brandSearchTargetPerMonth} a month`}>
            <ColumnChart months={report.months} values={s.brandByMonth} label="Brand searches by month" height={240} referenceLine={{ value: config.brandSearchTargetPerMonth, label: `Target ${config.brandSearchTargetPerMonth}` }} />
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Section id="assistants" title={`AI referrals, ${month}`} subtitle="Sessions by assistant">
            <MeterList
              ariaLabel={`AI referrals by assistant, ${month}`}
              rows={s.assistants.map((a) => ({ key: a.assistant, label: a.assistant, value: a.sessions, valueText: integer(a.sessions), fill: a.sessions, fillText: `${pct(a.share)} of AI referrals` }))}
              emptyText="No AI referrals recorded this month."
            />
          </Section>
        </Grid>
      </Grid>
    </Stack>
  );
}
