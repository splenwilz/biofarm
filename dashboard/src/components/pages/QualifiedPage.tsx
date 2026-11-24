"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import { useDashboard } from "@/components/DashboardProvider";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useReport } from "@/components/pages/useReport";
import { WindowToggle } from "@/components/WindowToggle";
import { dateLabel, integer } from "@/lib/format";
import { pipedriveDealUrl } from "@/lib/pipedrive";
import { qualifiedCsvRows, qualifiedList, type QualifiedRow } from "@/lib/qualified";

const PIPELINE: Record<string, string> = { developer: "Developer", landowner: "Landowner" };
type Show = "all" | "inbound" | "other";

/**
 * Every record behind the qualified number, one row each, with the agreed rule
 * applied in words. The counts at the top are the tiles' counts: the same code
 * decides both, so this page and the Overview cannot disagree. Anyone with the
 * link can open a number, read who each record is and why it counts, and check
 * it in Pipedrive.
 */
export function QualifiedPage() {
  const { report, config, filters, audience, period } = useReport();
  const { data } = useDashboard();
  const [show, setShow] = useState<Show>("all");
  const pipeline = filters.audience === "all" ? undefined : filters.audience;
  const list = useMemo(() => qualifiedList(data.deals, data.enquiries, config, report.trailingMonths, pipeline), [data.deals, data.enquiries, config, report.trailingMonths, pipeline]);
  const rows = show === "all" ? list.rows : list.rows.filter((r) => (show === "inbound" ? r.inbound : !r.inbound));
  const audienceNote = filters.audience === "all" ? "" : ` · ${audience.title.toLowerCase()}`;
  const inboundChannels = config.inboundChannels.join(", ");

  return (
    <Box>
      <PageHeader
        title="Qualified opportunities"
        subtitle={`${period.window}${audienceNote} · the records behind the number, with the agreed rule applied to each one`}
        info={`Inbound channels under the rule agreed with Sales and Land: ${inboundChannels}. Every other channel is outbound or network and counts in the wider figure only. The dates and names are Pipedrive's; follow a row to check it there.`}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <WindowToggle />
            <ExportButton filename={`qualified-opportunities-${report.reportMonth}`} rows={() => qualifiedCsvRows(list)} />
          </Stack>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard testId="kpi-qualified-inbound" label="Qualified opportunities" value={integer(list.counts.inbound)} detail="Inbound only, the agreed rule: the Overview's number" footnote={`Channels: ${inboundChannels}`} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard testId="kpi-qualified-other" label="Not inbound" value={integer(list.counts.network + list.counts.unattributed)} detail="Network and outreach: shown alongside, never in the headline" footnote={list.counts.unattributed ? `${integer(list.counts.unattributed)} with no source channel set` : "Every record has a source channel"} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard testId="kpi-qualified-all" label="All qualified" value={integer(list.counts.all)} detail="Every channel: inbound plus not inbound" footnote={`${period.window}${audienceNote}`} />
        </Grid>
      </Grid>

      <Section
        id="records"
        title="The records"
        subtitle={`${integer(rows.length)} of ${integer(list.counts.all)} shown, newest first`}
        padded={false}
        action={
          <ToggleButtonGroup size="small" exclusive value={show} onChange={(_, v: Show | null) => v && setShow(v)} aria-label="Which records to show" data-print="hide">
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="inbound">Inbound</ToggleButton>
            <ToggleButton value="other">Not inbound</ToggleButton>
          </ToggleButtonGroup>
        }
      >
        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2.5 }}>
            Nothing qualified in this window{show === "all" ? "" : " under this filter"}.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader aria-label="Qualified opportunities">
              <TableHead>
                <TableRow>
                  <TableCell>Who</TableCell>
                  <TableCell>Qualified</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>Inbound?</TableCell>
                  <TableCell>How it came in</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <Row key={r.deal.id} row={r} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>
    </Box>
  );
}

function Row({ row }: { row: QualifiedRow }) {
  const { deal } = row;
  const who = deal.personName ?? deal.title ?? `Deal ${deal.id}`;
  return (
    <TableRow>
      <TableCell component="th" scope="row" sx={{ fontWeight: 400 }}>
        <Link href={pipedriveDealUrl(deal.id)} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontWeight: 600, color: "text.primary" }}>
          {who}
        </Link>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {[deal.organisation, PIPELINE[deal.pipeline]].filter(Boolean).join(" · ")}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        {deal.qualifiedAt ? dateLabel(deal.qualifiedAt) : ""}
        {deal.qualifiedBy && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", whiteSpace: "normal", maxWidth: 260 }}>
            {deal.qualifiedBy}
          </Typography>
        )}
      </TableCell>
      <TableCell>{deal.channel ?? <Typography variant="caption" color="text.secondary">Not set</Typography>}</TableCell>
      <TableCell>
        <Chip size="small" label={row.inbound ? "Inbound" : "Not inbound"} color={row.inbound ? "primary" : "default"} variant={row.inbound ? "filled" : "outlined"} />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 220 }}>
          {row.verdict}
        </Typography>
      </TableCell>
      <TableCell>
        {row.cameIn}
        {(row.enquiry?.sourceLabel ?? deal.sourceLabel) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {row.enquiry?.sourceLabel ?? deal.sourceLabel}
            {row.enquiry?.landingPage ? ` · ${row.enquiry.landingPage}` : ""}
          </Typography>
        )}
      </TableCell>
      <TableCell>{deal.stage ?? <Typography variant="caption" color="text.secondary">Lead, not converted yet</Typography>}</TableCell>
      <TableCell sx={{ textTransform: "capitalize" }}>{deal.status}</TableCell>
    </TableRow>
  );
}
