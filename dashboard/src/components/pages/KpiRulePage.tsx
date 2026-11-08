"use client";

import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { useDashboard, type TargetChange, type TargetField } from "@/components/DashboardProvider";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { SHELL_USER } from "@/components/shell/nav";
import { useFilters } from "@/components/shell/useFilters";
import { QUALIFICATION_CHECKS, type KpiConfig } from "@/config/kpi";
import { dateLabel, monthLabel } from "@/lib/format";
import { inboundSourceGroups, qualifiedTargetForMonth } from "@/lib/kpi";

function Row({ term, children, termWidth = 220 }: { term: string; children: React.ReactNode; termWidth?: number }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.5, sm: 3 }} sx={{ py: 1.5, borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: { sm: termWidth }, flexShrink: 0, fontWeight: 500 }}>
        {term}
      </Typography>
      <Typography variant="body2" component="div" sx={{ flex: 1 }}>
        {children}
      </Typography>
    </Stack>
  );
}

function Chips({ items }: { items: readonly string[] }) {
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
      {items.map((i) => (
        <Chip key={i} label={i} size="small" variant="outlined" />
      ))}
    </Stack>
  );
}

const PIPELINE_LABEL = { developer: "Developer Pipeline", landowner: "Landowner Pipeline" } as const;

interface TargetFieldProps {
  label: string;
  value: number;
  max?: number;
  onCommit: (value: number) => void;
}

/**
 * A target field that applies when the person leaves it (or presses Enter), so
 * one change makes one log entry rather than one per keystroke. A value that
 * is not a whole number above zero (or over the maximum) is dropped and the
 * field goes back to the current target. The input is keyed by the current
 * value, so a change made elsewhere resets the draft without an effect.
 */
function TargetField(props: TargetFieldProps) {
  return <TargetInput key={props.value} {...props} />;
}

function TargetInput({ label, value, max, onCommit }: TargetFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n <= 0 || (max !== undefined && n > max)) {
      setDraft(String(value));
      return;
    }
    onCommit(Math.round(n));
    setDraft(String(Math.round(n)));
  };
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      slotProps={{ htmlInput: { min: 1, max, step: 1 } }}
      fullWidth
    />
  );
}

const LOG_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function targetLabel(field: TargetField, config: KpiConfig): string {
  switch (field) {
    case "targetQualifiedPerMonth":
      return `Qualified a month by ${monthLabel(config.qualifiedRamp.toMonth)}`;
    case "qualifiedRamp":
      return "Qualified a month now";
    case "brandSearchTargetPerMonth":
      return "Brand searches a month";
    case "aiMentionShareTarget":
      return "AI mention share";
  }
}

function targetText(field: TargetField, value: number): string {
  return field === "aiMentionShareTarget" ? `${Math.round(value * 100)}%` : String(value);
}

function ChangeLog({ log, config }: { log: TargetChange[]; config: KpiConfig }) {
  const cell = { py: 1.5 };
  return (
    <Table size="small" aria-label="Target changes">
      <TableHead>
        <TableRow>
          <TableCell sx={cell}>When</TableCell>
          <TableCell sx={cell}>Who</TableCell>
          <TableCell sx={cell}>Target</TableCell>
          <TableCell sx={cell} align="right">
            From
          </TableCell>
          <TableCell sx={cell} align="right">
            To
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {log.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} sx={{ ...cell, color: "text.secondary" }}>
              No changes yet.
            </TableCell>
          </TableRow>
        ) : (
          log.map((c) => (
            <TableRow key={c.id}>
              <TableCell sx={{ ...cell, whiteSpace: "nowrap" }}>{LOG_TIME.format(new Date(c.at))}</TableCell>
              <TableCell sx={cell}>{c.who}</TableCell>
              <TableCell sx={cell}>{targetLabel(c.field, config)}</TableCell>
              <TableCell sx={cell} align="right">
                {targetText(c.field, c.from)}
              </TableCell>
              <TableCell sx={cell} align="right">
                {targetText(c.field, c.to)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function KpiRulePage() {
  const { config, data, setTargets, targetLog, setCheck } = useDashboard();
  const { filters } = useFilters();
  // Until sign-in exists the person in the sidebar footer is who made the change.
  const who = SHELL_USER.name;
  const ramp = config.qualifiedRamp;
  const monthTarget = qualifiedTargetForMonth(config, filters.month);

  return (
    <Stack spacing={3}>
      <PageHeader title="KPI rule & targets" subtitle="What counts, held in one config file so changing the definition is an edit there, not to the screens. Proposed; to be confirmed with Phil and Vix." />

      <Section id="targets" title="Targets" subtitle="Used on every page. Anyone can change them. Every change is logged below.">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TargetField label={targetLabel("targetQualifiedPerMonth", config)} value={config.targetQualifiedPerMonth} onCommit={(v) => setTargets({ targetQualifiedPerMonth: v }, who)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TargetField label={targetLabel("qualifiedRamp", config)} value={ramp.fromValue} onCommit={(v) => setTargets({ qualifiedRamp: { ...ramp, fromValue: v } }, who)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TargetField label={targetLabel("brandSearchTargetPerMonth", config)} value={config.brandSearchTargetPerMonth} onCommit={(v) => setTargets({ brandSearchTargetPerMonth: v }, who)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TargetField label="AI mention share (%)" value={Math.round(config.aiMentionShareTarget * 100)} max={100} onCommit={(v) => setTargets({ aiMentionShareTarget: v / 100 }, who)} />
          </Grid>
        </Grid>
        <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 0.5, md: 3 }} sx={{ mt: 2.5, alignItems: { md: "baseline" } }}>
          <Typography variant="body2" color="text.secondary">
            Qualified inbound opportunities: {ramp.fromValue} a month from {monthLabel(ramp.fromMonth)}, rising to {config.targetQualifiedPerMonth} a month by {monthLabel(ramp.toMonth)}.
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            Target for {monthLabel(filters.month)}: {monthTarget}
          </Typography>
        </Stack>
      </Section>

      <Section id="target-log" title="Target changes" subtitle="Who changed what. Kept for this session until the backend stores it." padded={false}>
        <ChangeLog log={targetLog} config={config} />
      </Section>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Section id="rule" title="What counts as a qualified inbound opportunity">
            <Row term="Pipelines">{config.pipelines.map((p) => PIPELINE_LABEL[p]).join(" and ")}</Row>
            <Row term="Qualifies when">
              A Developer Pipeline deal is created (its first stage is &ldquo;OPPORTUNITY (Qualified)&rdquo;). A Landowner Pipeline deal moves past
              &ldquo;CALL / QUALIFY&rdquo;.
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Once the checks are agreed, a stage move alone won&apos;t count as qualified.
              </Typography>
            </Row>
            <Row term="Checks, developer enquiries">
              <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
                <Chip label="Draft, not yet agreed" size="small" color="warning" variant="outlined" />
                <FormGroup role="group" aria-label="Checks, developer enquiries">
                  {QUALIFICATION_CHECKS.map((check) => (
                    <FormControlLabel
                      key={check.id}
                      control={<Switch size="small" checked={config.qualificationChecks[check.id]} onChange={(e) => setCheck(check.id, e.target.checked)} slotProps={{ input: { role: "switch" } }} />}
                      label={check.label}
                      slotProps={{ typography: { variant: "body2" } }}
                    />
                  ))}
                </FormGroup>
                <Typography variant="body2" color="text.secondary">
                  Landowner enquiries will have their own checklist.
                </Typography>
              </Stack>
            </Row>
            <Row term="Inbound source channels">
              <Chips items={inboundSourceGroups(config)} />
            </Row>
            <Row term="Network channels (shown, not counted)">
              <Chips items={config.networkChannels} />
            </Row>
            <Row term="Counted in">the month the deal qualified</Row>
            <Row term="Target">{config.targetQualifiedPerMonth} a month (2027)</Row>
            <Row term="Cost per qualified opportunity">media and campaign spend ÷ qualified inbound opportunities, all audiences; also as a trailing {config.trailingMonths}-month figure</Row>
            <Row term="Brand searches">target {config.brandSearchTargetPerMonth} a month (Search Console impressions for queries naming Biofarm)</Row>
            <Row term="AI mention share">target {Math.round(config.aiMentionShareTarget * 100)}% of sampled prompts</Row>
            <Row term="Cohort horizons">
              {config.cohortHorizonsDays.join(", ")} days after the enquiry; a cohort is mature {config.cohortMaturityDays} days after its month end
            </Row>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2}>
            <Section id="sources" title="Where each number comes from">
              <Row term="Qualified opportunities" termWidth={150}>Pipedrive deals (v2) with per-deal stage history. Pipedrive updates arrive through webhooks as they happen.</Row>
              <Row term="Enquiries" termWidth={150}>Pipedrive: every lead in the Leads inbox plus every deal created directly in a marketing pipeline, back to 2024. Left out: bulk-imported deals, test and staff submissions, newsletter sign-ups. Website records add form, source and medium and landing page. Counted when the source channel is inbound.</Row>
              <Row term="Spend" termWidth={150}>Pulled from the Google Ads and LinkedIn APIs once a day. Entered by hand only for events and other costs.</Row>
              <Row term="Newsletter" termWidth={150}>Subscribers from Pipedrive persons; opens and clicks per issue from the Pipedrive Campaigns export, which has no API</Row>
              <Row term="Search and AI" termWidth={150}>Search Console for brand queries; GA4 for AI-referred sessions; mention share by prompt sampling</Row>
              <Row term="Never used" termWidth={150}>Google Ads conversion counts</Row>
            </Section>
            <Section id="status" title="Data status">
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Chip label={data.source === "demo" ? "Demo data" : "Pipedrive"} color={data.source === "demo" ? "warning" : "default"} variant="outlined" size="small" />
                <Typography variant="body2" color="text.secondary">
                  synced {dateLabel(data.syncedAt)} · {data.deals.length} deals · {data.enquiries.length} enquiries · {data.spend.length} spend lines
                </Typography>
              </Stack>
              {data.source === "demo" && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Generated to the shape of the real account: same pipelines, channels, volumes and attribution labels. The proportions are
                  real, the numbers are not.
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Enquiries that were converted to deals before 8 Nov 2026 carry the date they became a deal, because Pipedrive deletes a lead on
                conversion and the mirror did not exist to keep the original date. From that day the mirror keeps it.
              </Typography>
            </Section>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
