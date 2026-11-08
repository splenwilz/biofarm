"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";

import { EVENT_TYPE_LABEL } from "@/lib/insights";
import type { EventType, MarketingEvent } from "@/lib/types";

export type EventValues = Omit<MarketingEvent, "id" | "qualified">;

export interface EventDialogProps {
  open: boolean;
  /** The event being edited; omit to add a new one. */
  event?: MarketingEvent;
  /** "As of" date: an event can only be entered once it has happened. */
  today: string;
  onClose: () => void;
  onSave: (values: EventValues) => void;
  /** Offered only for events that can be removed (those added this session). */
  onRemove?: () => void;
}

type Field = "name" | "date" | "attendees" | "leads" | "cost";

function count(value: string): number | null {
  if (value.trim() === "") return 0;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * One dialog for adding an event and for editing it later: name, date, type, the numbers
 * from the day, and what it cost. Qualified is not editable; it comes from Pipedrive.
 * Mount it with a `key` per event so the fields start from that event's values.
 */
export function EventDialog({ open, event, today, onClose, onSave, onRemove }: EventDialogProps) {
  const id = useId();
  const [name, setName] = useState(event?.name ?? "");
  const [date, setDate] = useState(event?.date.slice(0, 10) ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "trade_show");
  const [attendees, setAttendees] = useState(event ? String(event.attendees) : "");
  const [leads, setLeads] = useState(event ? String(event.leads) : "");
  const [cost, setCost] = useState(typeof event?.costGbp === "number" ? String(event.costGbp) : "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (name.trim().length < 3) next.name = "Give the event a name";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) next.date = "Enter the date";
    else if (date > today.slice(0, 10)) next.date = "Add it after the event has happened";
    const people = count(attendees);
    const captured = count(leads);
    if (people === null) next.attendees = "Whole number";
    if (captured === null) next.leads = "Whole number";
    else if (people !== null && captured > people) next.leads = "More leads than attendees";
    let costGbp: number | null = null;
    if (cost.trim() !== "") {
      const value = Number(cost);
      if (!Number.isFinite(value) || value <= 0) next.cost = "Enter a cost above zero, or leave it blank";
      else costGbp = Math.round(value * 100) / 100;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ name: name.trim(), date: `${date}T09:00:00.000Z`, type, attendees: people ?? 0, leads: captured ?? 0, costGbp });
  }

  const titleId = `${id}-title`;
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
      <DialogTitle id={titleId}>{event ? "Edit event" : "Add an event"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField size="small" label="Name" id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} error={!!errors.name} helperText={errors.name ?? " "} autoFocus fullWidth />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" label="Date" id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={!!errors.date} helperText={errors.date ?? " "} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today.slice(0, 10) } }} sx={{ flex: 1 }} />
            <TextField select size="small" label="Type" id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as EventType)} slotProps={{ select: { native: true } }} helperText=" " sx={{ flex: 1 }}>
              {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </option>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" label="Attendees" id={`${id}-attendees`} value={attendees} onChange={(e) => setAttendees(e.target.value)} error={!!errors.attendees} helperText={errors.attendees ?? " "} slotProps={{ htmlInput: { inputMode: "numeric", min: 0, step: 1 } }} sx={{ flex: 1 }} />
            <TextField size="small" label="Leads" id={`${id}-leads`} value={leads} onChange={(e) => setLeads(e.target.value)} error={!!errors.leads} helperText={errors.leads ?? " "} slotProps={{ htmlInput: { inputMode: "numeric", min: 0, step: 1 } }} sx={{ flex: 1 }} />
            <TextField size="small" label="Cost (£)" id={`${id}-cost`} value={cost} onChange={(e) => setCost(e.target.value)} error={!!errors.cost} helperText={errors.cost ?? "Stand, travel and fees"} slotProps={{ htmlInput: { inputMode: "decimal", min: 0, step: "0.01" } }} sx={{ flex: 1 }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Qualified enquiries come from Pipedrive once deals can be linked to an event. Leave the cost blank until it is known; events without a cost stay out of cost per qualified.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
        {onRemove && (
          <Button color="inherit" onClick={onRemove} sx={{ mr: "auto", color: "text.secondary" }}>
            Remove event
          </Button>
        )}
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </DialogActions>
      </form>
    </Dialog>
  );
}
