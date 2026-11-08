"use client";

import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";

import { Icon } from "@/components/shell/icons";
import { gbp, monthLabel, PLATFORM_LABEL } from "@/lib/format";
import type { SpendEntry } from "@/lib/types";

export { PLATFORM_LABEL };

export interface SpendPanelProps {
  months: string[];
  entries: SpendEntry[];
  onRemove?: (id: string) => void;
}

/** The month's spend lines with a total and a remove control. Adding and importing live in the page header. */
export function SpendPanel({ months, entries, onRemove }: SpendPanelProps) {
  const id = useId();
  const [month, setMonth] = useState(months[months.length - 1]);
  const monthEntries = entries.filter((e) => e.month === month);
  const total = monthEntries.reduce((s, e) => s + e.amountGbp, 0);

  return (
    <Stack spacing={2.5}>
      <TextField select size="small" label="Month" id={`${id}-month`} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ select: { native: true } }} sx={{ minWidth: 160, alignSelf: "flex-start" }} data-print="hide">
        {[...months].reverse().map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </TextField>

      {monthEntries.length > 0 ? (
        <Table size="small" aria-label={`Media spend, ${monthLabel(month)}`} data-spacing="comfortable" sx={{ "& td, & th": { py: 2 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Platform</TableCell>
              <TableCell>Campaign</TableCell>
              <TableCell align="right">Spend</TableCell>
              {onRemove && <TableCell align="right" sx={{ width: 56 }} data-print="hide" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {monthEntries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{PLATFORM_LABEL[e.platform]}</TableCell>
                <TableCell>{e.campaign}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {gbp(e.amountGbp)}
                </TableCell>
                {onRemove && (
                  <TableCell align="right" sx={{ py: "0 !important" }} data-print="hide">
                    <IconButton size="small" aria-label={`Remove ${PLATFORM_LABEL[e.platform]} ${e.campaign} ${gbp(e.amountGbp)}`} onClick={() => onRemove(e.id)} sx={{ color: "text.secondary" }}>
                      <Icon name="trash" size={16} />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
                Total {monthLabel(month)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {gbp(total)}
              </TableCell>
              {onRemove && <TableCell data-print="hide" />}
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No spend recorded for {monthLabel(month)} yet.
        </Typography>
      )}
    </Stack>
  );
}
