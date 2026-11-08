"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";

import { Icon } from "@/components/shell/icons";
import { monthLabel } from "@/lib/format";
import type { Annotation } from "@/lib/types";

export interface AnnotationNotesProps {
  months: string[];
  notes: Annotation[];
  onAdd: (note: Omit<Annotation, "id">) => void;
  onRemove: (id: string) => void;
}

/** Notes pinned to months under the trend chart, so a change on the chart has its reason beside it. */
export function AnnotationNotes({ months, notes, onAdd, onRemove }: AnnotationNotesProps) {
  const id = useId();
  const [month, setMonth] = useState(months[months.length - 1]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shown = notes.filter((n) => months.includes(n.month)).sort((a, b) => b.month.localeCompare(a.month));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length < 3) {
      setError("Say what happened in a few words");
      return;
    }
    setError(null);
    onAdd({ month, text: text.trim() });
    setText("");
  }

  return (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      <Typography variant="subtitle2" color="text.secondary" component="h3">
        Notes on the chart
      </Typography>
      {shown.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No notes in this window yet.
        </Typography>
      ) : (
        <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }} aria-label="Notes">
          {shown.map((n) => (
            <Stack component="li" key={n.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 72, fontVariantNumeric: "tabular-nums" }}>
                {monthLabel(n.month)}
              </Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {n.text}
              </Typography>
              <IconButton size="small" aria-label={`Remove note: ${n.text}`} onClick={() => onRemove(n.id)} sx={{ color: "text.secondary" }} data-print="hide">
                <Icon name="trash" size={14} />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
      <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={submit} noValidate data-print="hide" sx={{ alignItems: { sm: "flex-start" } }}>
        <TextField select size="small" label="Month" id={`${id}-month`} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ select: { native: true } }} sx={{ minWidth: 130 }}>
          {[...months].reverse().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </TextField>
        <TextField size="small" label="What happened" id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} error={error !== null} helperText={error ?? " "} sx={{ flex: 1 }} />
        <Button type="submit" variant="outlined" color="inherit" startIcon={<Icon name="plus" size={16} />} sx={{ height: 40, borderColor: "divider", fontWeight: 500, whiteSpace: "nowrap" }}>
          Add note
        </Button>
      </Stack>
    </Stack>
  );
}
