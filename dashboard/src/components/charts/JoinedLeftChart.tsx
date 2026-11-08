"use client";

import Box from "@mui/material/Box";
import { BarChart, barClasses } from "@mui/x-charts/BarChart";

import { chart } from "@/components/charts/palette";
import { integer, monthLabel, signed } from "@/lib/format";

export interface JoinedLeftChartProps {
  months: string[];
  joined: number[];
  left: number[];
  /** Names the chart; also the figure's accessible name. */
  label: string;
  height?: number;
  yAxisWidth?: number;
}

/**
 * Diverging form: people who joined as a column above zero, people who left as a column below
 * it, and the net change written above each month. The axis shows leavers as negatives;
 * labels and tooltips show plain counts.
 */
export function JoinedLeftChart({ months, joined, left, label, height = 220, yAxisWidth = 44 }: JoinedLeftChartProps) {
  const net = months.map((_, i) => (joined[i] ?? 0) - (left[i] ?? 0));
  const count = (v: number | null) => (v === null ? "–" : integer(Math.abs(v)));
  return (
    <Box component="figure" aria-label={label} sx={{ m: 0 }}>
      <BarChart
        height={height}
        borderRadius={4}
        xAxis={[{ scaleType: "band", data: months.map((m) => monthLabel(m, false)), height: 26, categoryGapRatio: 0.55 }]}
        yAxis={[{ width: yAxisWidth, valueFormatter: (v: number) => integer(v) }]}
        series={[
          { id: "joined", data: joined, label: "Joined", stack: "flow", color: chart.accent, valueFormatter: count, barLabel: (item) => signed(net[item.dataIndex]), barLabelPlacement: "outside" },
          { id: "left", data: left.map((v) => -v), label: "Left", stack: "flow", color: chart.context, valueFormatter: count },
        ]}
        slotProps={{ legend: { position: { vertical: "bottom", horizontal: "center" } } }}
        margin={{ left: 0, right: 8, top: 20, bottom: 0 }}
        grid={{ horizontal: true }}
        sx={{
          "& .MuiChartsGrid-line": { stroke: chart.grid },
          "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: chart.grid },
          [`& .${barClasses.label}`]: { fontSize: 11, fill: chart.ink },
        }}
      />
    </Box>
  );
}
