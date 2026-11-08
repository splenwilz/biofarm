import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { chart } from "@/components/charts/palette";

export interface MeterRow {
  key: string;
  label: string;
  /** Drives the track length, relative to the largest row. */
  value: number;
  valueText: string;
  /** Optional filled part of the track, in the same unit as `value`. */
  fill?: number;
  /** Line under the meter: what the fill is, or any detail. */
  fillText?: string;
}

export interface MeterListProps {
  ariaLabel: string;
  rows: MeterRow[];
  emptyText?: string;
}

/**
 * The BoothIQ "payment methods" treatment: a label, a number, and a thin meter
 * whose length compares rows, with an optional darker fill for the part of the
 * row that converted. The numbers are always printed; the bars are decorative.
 */
export function MeterList({ ariaLabel, rows, emptyText = "Nothing in this period." }: MeterListProps) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        {emptyText}
      </Typography>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Stack component="ul" aria-label={ariaLabel} spacing={1.75} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {rows.map((r) => {
        const trackWidth = `${(r.value / max) * 100}%`;
        const fillWidth = r.fill !== undefined && r.value > 0 ? `${(r.fill / r.value) * 100}%` : "0%";
        return (
          <Box component="li" key={r.key}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", gap: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0 }} noWrap>
                {r.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {r.valueText}
              </Typography>
            </Stack>
            <Box aria-hidden="true" sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: chart.grid, overflow: "hidden" }}>
              <Box data-testid="meter-track" sx={{ height: "100%", borderRadius: 3, bgcolor: chart.track, overflow: "hidden" }} style={{ width: trackWidth }}>
                <Box data-testid="meter-fill" sx={{ height: "100%", borderRadius: 3, bgcolor: chart.accent }} style={{ width: fillWidth }} />
              </Box>
            </Box>
            {r.fillText && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                {r.fillText}
              </Typography>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
