"use client";

import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";

import { chart } from "@/components/charts/palette";
import type { OutcomeRow } from "@/lib/insights";

/**
 * What became of qualified opportunities, by source: a horizontal stacked bar
 * per source. Status colours, since the segments mean good / pending / bad:
 * won in the success green, open in the context grey, lost in the error red.
 * The legend and the hover tooltip carry the identity, never colour alone.
 */
export function OutcomeBars({ rows }: { rows: OutcomeRow[] }) {
  const theme = useTheme();
  const height = Math.max(160, rows.length * 34 + 70);
  return (
    <Box component="figure" aria-label="Outcome of qualified enquiries by source" sx={{ m: 0 }}>
      <BarChart
        layout="horizontal"
        height={height}
        borderRadius={4}
        yAxis={[{ scaleType: "band", data: rows.map((r) => r.group), width: 150, categoryGapRatio: 0.45 }]}
        xAxis={[{ height: 26 }]}
        series={[
          { data: rows.map((r) => r.won), label: "Won", stack: "o", color: theme.palette.success.main },
          { data: rows.map((r) => r.open), label: "Still open", stack: "o", color: chart.context },
          { data: rows.map((r) => r.lost), label: "Lost", stack: "o", color: theme.palette.error.main },
        ]}
        slotProps={{ legend: { position: { vertical: "bottom", horizontal: "center" } } }}
        margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
        grid={{ vertical: true }}
        sx={{ "& .MuiChartsGrid-line": { stroke: chart.grid }, "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: chart.grid } }}
      />
    </Box>
  );
}
