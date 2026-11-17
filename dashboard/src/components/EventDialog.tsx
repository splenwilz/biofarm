"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";

import { EVENT_TYPE_LABEL } from "@/lib/insights";
import type { EventInput, EventType, MarketingEvent } from "@/lib/types";

export type EventValues = EventInput;

/** Four months after the event: how long its records usually keep arriving. */
export function defaultWindowTo(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 120);
  return d.toISOString().slice(0, 10);
}

export interface EventDialogProps {
  open: boolean;
  /** The event being edited; omit to add a new one. */
  event?: MarketingEvent;
  onClose: () => void;
  /** Rejected (throws) when the feed refuses the write; the dialog then shows the message and stays open. */
  onSave: (values: EventValues) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
}

type Field = "name" | "date" | "attendees" | "cost" | "window" | "save";

function count(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

/**
 * One dialog for adding an event and for editing it later: name, date, type, attendees,
 * what it cost, and how its enquiries are found in Pipedrive (words in the title, or the
 * Trade Show / Event channel, inside a date window). Leads and qualified are not editable;
 * they are counted from Pipedrive. Mount it with a `key` per event so the fields start
 * from that event's values. Future dates are allowed: an event can be set up before it
 * happens so its cost and enquiries land in the right place from day one.
 */
export function EventDialog({ open, event, onClose, onSave, onRemove }: EventDialogProps) {
  const id = useId();
  const [name, setName] = useState(event?.name ?? "");
  const [date, setDate] = useState(event?.date.slice(0, 10) ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "trade_show");
  const [attendees, setAttendees] = useState(typeof event?.attendees === "number" ? String(event.attendees) : "");
  const [cost, setCost] = useState(typeof event?.costGbp === "number" ? String(event.costGbp) : "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [titleWords, setTitleWords] = useState(event?.match?.titleWords.join(", ") ?? "");
  const [channel, setChannel] = useState(event?.match?.channel ?? false);
  const [windowFrom, setWindowFrom] = useState(event?.match?.windowFrom ?? "");
  const [windowTo, setWindowTo] = useState(event?.match?.windowTo ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (name.trim().length < 3) next.name = "Give the event a name";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) next.date = "Enter the date";
    const people = count(attendees);
    if (Number.isNaN(people)) next.attendees = "Whole number";
    let costGbp: number | null = null;
    if (cost.trim() !== "") {
      const value = Number(cost);
      if (!Number.isFinite(value) || value <= 0) next.cost = "Enter a cost above zero, or leave it blank";
      else costGbp = Math.round(value * 100) / 100;
    }
    const from = windowFrom || date;
    const to = windowTo || (date ? defaultWindowTo(date) : "");
    if (from && to && to < from) next.window = "The window ends before it starts";
    setErrors(next);
    if (Object.keys(next).length) return;
    const words = titleWords.split(",").map((w) => w.trim()).filter(Boolean);
    const values: EventValues = {
      name: name.trim(),
      date: `${date}T09:00:00.000Z`,
      type,
      attendees: people,
      costGbp,
      notes: notes.trim() || null,
      match: { labels: event?.match?.labels ?? [], dealSources: event?.match?.dealSources ?? [], titleWords: words, channel, windowFrom: from, windowTo: to },
    };
    setBusy(true);
    try {
      await onSave(values);
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : "The event was not saved" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setBusy(true);
    try {
      await onRemove();
    } catch (err) {
      setConfirmRemove(false);
      setErrors({ save: err instanceof Error ? err.message : "The event was not removed" });
    } finally {
      setBusy(false);
    }
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
            <TextField size="small" label="Date" id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={!!errors.date} helperText={errors.date ?? " "} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField select size="small" label="Type" id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as EventType)} slotProps={{ select: { native: true } }} helperText=" " sx={{ flex: 1 }}>
              {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </option>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" label="Attendees" id={`${id}-attendees`} value={attendees} onChange={(e) => setAttendees(e.target.value)} error={!!errors.attendees} helperText={errors.attendees ?? "Blank if not known"} slotProps={{ htmlInput: { inputMode: "numeric", min: 0, step: 1 } }} sx={{ flex: 1 }} />
            <TextField size="small" label="Cost (£)" id={`${id}-cost`} value={cost} onChange={(e) => setCost(e.target.value)} error={!!errors.cost} helperText={errors.cost ?? "Stand, travel and fees"} slotProps={{ htmlInput: { inputMode: "decimal", min: 0, step: "0.01" } }} sx={{ flex: 1 }} />
          </Stack>
          <TextField size="small" label="Notes" id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} helperText=" " fullWidth multiline minRows={1} />
          <Typography variant="subtitle2">Find its enquiries in Pipedrive</Typography>
          <TextField size="small" label="Words in the title" id={`${id}-words`} value={titleWords} onChange={(e) => setTitleWords(e.target.value)} helperText="Comma-separated, whole words, e.g. FBI" fullWidth />
          <FormControlLabel control={<Checkbox size="small" checked={channel} onChange={(e) => setChannel(e.target.checked)} />} label="Every lead or deal on the Trade Show / Event channel" />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" label="Logged from" id={`${id}-from`} type="date" value={windowFrom} onChange={(e) => setWindowFrom(e.target.value)} helperText={errors.window ?? "Blank: the event date"} error={!!errors.window} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField size="small" label="Logged until" id={`${id}-to`} type="date" value={windowTo} onChange={(e) => setWindowTo(e.target.value)} helperText="Blank: four months after" slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Leads and qualified enquiries are counted from Pipedrive by these rules; a lead label or Deal Source already set on the event is kept. Leave the cost blank until it is known; events without a cost stay out of cost per qualified.
          </Typography>
          {errors.save && (
            <Typography variant="body2" color="error" role="alert">
              {errors.save}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
        {onRemove && !confirmRemove && (
          <Button color="inherit" onClick={() => setConfirmRemove(true)} disabled={busy} sx={{ mr: "auto", color: "text.secondary" }}>
            Remove event
          </Button>
        )}
        {onRemove && confirmRemove && (
          <Stack direction="row" spacing={1} sx={{ mr: "auto", alignItems: "center" }}>
            <Typography variant="body2">Remove this event and its cost?</Typography>
            <Button color="error" size="small" disabled={busy} onClick={() => void remove()}>
              Yes, remove
            </Button>
            <Button color="inherit" size="small" disabled={busy} onClick={() => setConfirmRemove(false)}>
              Keep
            </Button>
          </Stack>
        )}
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy}>
          Save
        </Button>
      </DialogActions>
      </form>
    </Dialog>
  );
}
