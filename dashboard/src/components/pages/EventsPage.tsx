"use client";

import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import { BarTable } from "@/components/charts/BarTable";
import { useDashboard } from "@/components/DashboardProvider";
import { EventDialog } from "@/components/EventDialog";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Icon } from "@/components/shell/icons";
import { useReport } from "@/components/pages/useReport";
import { dateLabel, gbp, integer, monthLabel, pct } from "@/lib/format";
import { EVENT_TYPE_LABEL, eventsReport, type EventRow } from "@/lib/insights";

export function EventsPage() {
  const { events, addEvent, updateEvent, removeEvent, today } = useDashboard();
  // null: closed · "add": the empty dialog · an event: that event's dialog
  const [dialog, setDialog] = useState<null | "add" | EventRow>(null);
  const { report, provenance, config } = useReport();
  const e = useMemo(() => eventsReport(events, report.months, { maturityDays: config.cohortMaturityDays, today }), [events, report.months, config.cohortMaturityDays, today]);
  const costed = e.totals.costedEvents;
  const window = `${monthLabel(report.months[0])} to ${monthLabel(report.reportMonth)}`;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Events"
        subtitle={`Trade shows, CPD sessions and webinars · ${window}`}
        actions={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="outlined" color="inherit" onClick={() => setDialog("add")} startIcon={<Icon name="plus" size={16} />} data-print="hide" sx={{ height: 40, borderColor: "divider", fontWeight: 500, whiteSpace: "nowrap" }}>
              Add event
            </Button>
            <ExportButton filename={`biofarm-events-${report.months[0]}-to-${report.reportMonth}`} rows={() => [...e.events].reverse().map((x) => ({ date: x.date.slice(0, 10), event: x.name, type: EVENT_TYPE_LABEL[x.type], attendees: x.attendees, leads: x.leads, qualified: x.qualified, cost_gbp: x.costGbp ?? null }))} />
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard label="Events" value={integer(e.totals.events)} detail={`${integer(e.totals.attendees)} attendees in total`} footnote={`Last 12 months · ${provenance}`} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard label="Leads from events" value={integer(e.totals.leads)} detail={e.totals.attendees ? `${pct(e.totals.leads / e.totals.attendees)} of attendees` : undefined} footnote="Captured at or after the event, logged in Pipedrive with the Trade Show / Event channel" />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard label="Qualified from events" value={integer(e.totals.qualified)} detail={e.totals.leads ? `${pct(e.totals.qualified / e.totals.leads)} of event leads so far` : undefined} footnote="Recent events are still maturing" />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <KpiCard
            testId="kpi-event-cpqo"
            label="Cost per qualified from events"
            textValue={costed === 0}
            value={costed === 0 ? "Add event costs to see this" : e.cpqo === null ? "–" : gbp(e.cpqo)}
            compare={costed === 0 ? undefined : costed > 0 && e.cpqo === null ? `${gbp(e.totals.costGbp)} spent, none qualified yet` : `${integer(costed)} of ${integer(e.totals.events)} events have a cost`}
            info={["Total cost of the events with a cost entered ÷ the qualified enquiries from those events, last 12 months.", `${gbp(e.totals.costGbp)} · ${integer(e.totals.qualifiedCosted)} qualified · costs are stand, travel and any fees, entered from each row's edit control.`]}
          />
        </Grid>
      </Grid>

      <Section
        id="events"
        title="Each event"
        subtitle="Bar length is leads; the darker part qualified"
        info={`Open a row's edit control to enter what the event cost (stand, travel and fees) or to correct its details. Cost per qualified divides that cost by the event's qualified enquiries so far, and shows "–" without a cost or before anything qualified. Events younger than ${integer(config.cohortMaturityDays)} days are marked maturing, the same window the cohort chart uses, because qualification takes time.`}
        padded={false}
      >
        <BarTable
          ariaLabel="Events"
          labelHeader="Event"
          barHeader="Leads"
          barWidth="22%"
          columns={["Attendees", "Leads", "Qualified", "Cost", "Cost per qualified"]}
          comfortable
          rows={e.events.map((x) => ({
            key: x.id,
            label: x.name,
            sublabel: `${dateLabel(x.date)} · ${EVENT_TYPE_LABEL[x.type]}${x.mature ? "" : " · Maturing"}`,
            total: x.leads,
            fill: x.qualified,
            cells: [integer(x.attendees), integer(x.leads), integer(x.qualified), typeof x.costGbp === "number" ? gbp(x.costGbp) : "–", x.cpqo === null ? "–" : gbp(x.cpqo)],
            muted: !x.mature,
            action: (
              <IconButton size="small" aria-label={`Edit ${x.name}`} onClick={() => setDialog(x)} sx={{ color: "text.secondary" }}>
                <Icon name="pencil" size={16} />
              </IconButton>
            ),
          }))}
          emptyText="No events in this window."
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, py: 1.5 }}>
          Maturing events are younger than {integer(config.cohortMaturityDays)} days, as on the cohort chart.
        </Typography>
      </Section>

      {dialog !== null && (
        <EventDialog
          key={dialog === "add" ? "add" : dialog.id}
          open
          event={dialog === "add" ? undefined : dialog}
          today={today}
          onClose={() => setDialog(null)}
          onSave={(values) => {
            if (dialog === "add") addEvent({ ...values, qualified: 0 });
            else updateEvent(dialog.id, values);
            setDialog(null);
          }}
          onRemove={
            dialog !== "add" && dialog.id.startsWith("event-local-")
              ? () => {
                  removeEvent(dialog.id);
                  setDialog(null);
                }
              : undefined
          }
        />
      )}
    </Stack>
  );
}
