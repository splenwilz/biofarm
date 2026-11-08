import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { chart, RAMP } from "@/components/charts/palette";
import { monthLabel, pct } from "@/lib/format";
import type { CohortRow } from "@/lib/kpi";

export interface CohortHeatmapProps {
  /** Print the reading guide under the table; pass false when the card carries it elsewhere. */
  caption?: boolean;
  rows: CohortRow[];
  horizons: readonly number[];
  /** Half-width cards: short column headers. */
  compact?: boolean;
  /** A month with fewer enquiries than this shows a dash instead of a share. */
  minEnquiries?: number;
}

/**
 * Enquiry-month cohorts as a grid: one row per month, one column per horizon,
 * each cell tinted on a single-hue ramp by the share that qualified. The number
 * is printed in every cell, so colour only adds the shape.
 */
export function CohortHeatmap({ rows, horizons, compact = false, caption = true, minEnquiries = 0 }: CohortHeatmapProps) {
  const shares = rows.flatMap((r) => horizons.map((h) => (r.base ? (r.qualifiedBy[h] ?? 0) / r.base : 0)));
  const maxShare = Math.max(...shares, 0.0001);
  const steps = RAMP.length;

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box
        component="table"
        aria-label="Share of enquiries qualified, by enquiry month"
        sx={{ borderCollapse: "separate", borderSpacing: "3px 3px", width: "100%", "& th": { fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary", textAlign: "left", px: 1, py: 0.5, whiteSpace: "nowrap" } }}
      >
        <thead>
          <tr>
            <th scope="col">Enquiry month</th>
            <th scope="col" style={{ textAlign: "right" }}>
              Enquiries
            </th>
            {horizons.map((h) => (
              <th key={h} scope="col" style={{ textAlign: "center" }}>
                {compact ? `${h} d` : `Within ${h} days`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} style={{ color: r.mature ? undefined : "var(--mui-palette-text-secondary)" }}>
              <Box component="th" scope="row" sx={{ fontWeight: "500 !important", textTransform: "none !important", letterSpacing: "0 !important", fontSize: "0.875rem !important", color: "inherit !important", lineHeight: 1.2 }}>
                {monthLabel(r.month)}
                {!r.mature && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.6875rem", fontWeight: 400 }}>
                    maturing
                  </Typography>
                )}
              </Box>
              <Box component="td" sx={{ textAlign: "right", px: 1, fontVariantNumeric: "tabular-nums", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                {r.enquiries}
              </Box>
              {horizons.map((h) => {
                const count = r.qualifiedBy[h] ?? 0;
                const share = r.base >= Math.max(minEnquiries, 1) ? count / r.base : null;
                const step = share === null || share === 0 ? 0 : Math.max(1, Math.round((share / maxShare) * steps));
                return (
                  <Box
                    component="td"
                    key={h}
                    data-step={step}
                    sx={{
                      textAlign: "center",
                      px: 1,
                      py: 0.875,
                      borderRadius: 1,
                      bgcolor: step === 0 ? chart.grid : RAMP[step - 1],
                      fontVariantNumeric: "tabular-nums",
                      fontSize: "0.875rem",
                      fontWeight: step >= steps - 1 ? 600 : 400,
                      color: "text.primary",
                      opacity: r.mature ? 1 : 0.8,
                      minWidth: 56,
                    }}
                  >
                    <span title={`${count} of ${r.base} lead enquiries qualified within ${h} days`}>{pct(share)}</span>
                  </Box>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Box>
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, px: 0.5 }}>
          Darker means a larger share of that month&apos;s enquiries qualified. Months marked maturing are younger than the sales cycle. Hover a cell for the count.
        </Typography>
      )}
    </Box>
  );
}
