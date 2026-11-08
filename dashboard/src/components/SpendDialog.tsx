"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";

import { monthLabel, PLATFORM_LABEL } from "@/lib/format";
import type { SpendEntry, SpendPlatform } from "@/lib/types";

export interface SpendDialogProps {
  open: boolean;
  months: string[];
  onClose: () => void;
  onAdd: (entry: Omit<SpendEntry, "id">) => void;
}

/** Manual entry of one spend line: month, platform, campaign and amount. Opened from the Media spend header. */
export function SpendDialog({ open, months, onClose, onAdd }: SpendDialogProps) {
  const id = useId();
  const [month, setMonth] = useState(months[months.length - 1]);
  const [platform, setPlatform] = useState<SpendPlatform>("google_ads");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectNative = { select: { native: true } } as const;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(value) || value <= 0) {
      setError("Enter an amount above zero");
      return;
    }
    setError(null);
    onAdd({ month, platform, campaign: campaign.trim() || PLATFORM_LABEL[platform], amountGbp: Math.round(value * 100) / 100 });
    setCampaign("");
    setAmount("");
  }

  const titleId = `${id}-title`;
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle id={titleId}>Add spend</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select size="small" label="Month" id={`${id}-month`} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={selectNative} sx={{ flex: 1 }}>
                {[...months].reverse().map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </TextField>
              <TextField select size="small" label="Platform" id={`${id}-platform`} value={platform} onChange={(e) => setPlatform(e.target.value as SpendPlatform)} slotProps={selectNative} sx={{ flex: 1 }}>
                {(Object.keys(PLATFORM_LABEL) as SpendPlatform[]).map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </TextField>
            </Stack>
            <TextField size="small" label="Campaign" id={`${id}-campaign`} value={campaign} onChange={(e) => setCampaign(e.target.value)} helperText="Leave blank to record it against the platform" autoFocus fullWidth />
            <TextField
              size="small"
              label="Amount (£)"
              id={`${id}-amount`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={error !== null}
              helperText={error ?? " "}
              slotProps={{ htmlInput: { inputMode: "decimal", min: 0, step: "0.01" } }}
              sx={{ maxWidth: 220 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
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
