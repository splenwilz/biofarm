"use client";

import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { useAlerts } from "@/components/pages/useAlerts";
import { useReport } from "@/components/pages/useReport";
import { dateLabel, integer, monthLabel, pct } from "@/lib/format";
import { pipedriveDealUrl } from "@/lib/pipedrive";

const PIPELINE = { developer: "Developer", landowner: "Landowner" } as const;

export function DataQualityPage() {
  const { report } = useReport();
  const { quality } = useAlerts();
  const window = `${monthLabel(report.months[0])} to ${monthLabel(report.reportMonth)}`;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Data quality"
        subtitle={`Gaps in the records that distort the numbers · ${window}`}
        actions={<ExportButton filename={`biofarm-deals-without-channel-${report.reportMonth}`} rows={() => quality.dealsToFix.map((d) => ({ deal_id: d.id, pipeline: PIPELINE[d.pipeline], created: d.createdAt.slice(0, 10), status: d.status, person_id: d.personId }))} />}
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard label="Deals without a source channel" value={pct(quality.dealsNoChannel.share)} detail={`${integer(quality.dealsNoChannel.count)} of ${integer(quality.dealsNoChannel.total)} deals`} footnote="Counted as unattributed, so marketing's number is understated" />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard label="Website deals without attribution" value={pct(quality.websiteDealsNoLabel.share)} detail={`${integer(quality.websiteDealsNoLabel.count)} of ${integer(quality.websiteDealsNoLabel.total)} Website-channel deals`} footnote="Created by hand instead of converted from the lead; source is unknown" />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KpiCard label="Enquiries without a Pipedrive person" value={pct(quality.enquiriesNoPerson.share)} detail={`${integer(quality.enquiriesNoPerson.count)} of ${integer(quality.enquiriesNoPerson.total)} enquiries`} footnote="Cannot be matched to a deal, so cohorts miss them" />
        </Grid>
      </Grid>

      <Section id="fix" title="Deals to fix in Pipedrive" subtitle={quality.dealsToFix.length ? `${integer(quality.dealsToFix.length)} deals in the window with no Source channel, newest first. Set the channel in Pipedrive and the dashboard updates automatically once it's fixed.` : "Every deal in the window has a source channel."} padded={false}>
        {quality.dealsToFix.length > 0 && (
          <TableContainer sx={{ maxHeight: 420 }}>
            <Table size="small" stickyHeader aria-label="Deals without a source channel">
              <TableHead>
                <TableRow>
                  <TableCell>Deal</TableCell>
                  <TableCell>Pipeline</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quality.dealsToFix.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell component="th" scope="row">
                      <Link href={pipedriveDealUrl(d.id)} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontWeight: 600, color: "text.primary" }}>
                        {d.id}
                      </Link>
                    </TableCell>
                    <TableCell>{PIPELINE[d.pipeline]}</TableCell>
                    <TableCell>{dateLabel(d.createdAt)}</TableCell>
                    <TableCell sx={{ textTransform: "capitalize" }}>{d.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>

      {quality.monthsNoSpend.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Months with no spend entered: {quality.monthsNoSpend.map((m) => monthLabel(m)).join(", ")}.
        </Typography>
      )}
    </Stack>
  );
}
