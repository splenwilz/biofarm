"use client";

import Box from "@mui/material/Box";
import { BarChart } from "@mui/x-charts/BarChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";

import { ChartNotes } from "@/components/charts/ChartNotes";
import { chart } from "@/components/charts/palette";
import { monthLabel } from "@/lib/format";
import type { MonthlyQualified } from "@/lib/kpi";
import type { Annotation } from "@/lib/types";

export interface TrendChartProps {
  rows: MonthlyQualified[];
  target?: number;
  /** Notes pinned to months, drawn as thin vertical markers with their text. */
  annotations?: Annotation[];
}

/** Emphasis form: marketing's inbound series in the accent, Sales' network deals in grey for context. */
export function TrendChart({ rows, target, annotations = [] }: TrendChartProps) {
  const labels = rows.map((r) => monthLabel(r.month, rows.length > 12));
  return (
    <Box component="figure" aria-label="Qualified opportunities by month" sx={{ m: 0 }}>
      <BarChart
        height={280}
        borderRadius={4}
        xAxis={[{ scaleType: "band", data: labels, height: 26, categoryGapRatio: rows.length > 12 ? 0.4 : 0.55 }]}
        yAxis={[{ width: 32 }]}
        series={[
          { data: rows.map((r) => r.inbound), label: "Inbound (marketing)", stack: "q", color: chart.accent },
          { data: rows.map((r) => r.network), label: "Network (sales)", stack: "q", color: chart.context },
        ]}
        slotProps={{ legend: { position: { vertical: "bottom", horizontal: "center" } } }}
        margin={{ left: 0, right: 8, top: 18, bottom: 0 }}
        grid={{ horizontal: true }}
        sx={{ "& .MuiChartsGrid-line": { stroke: chart.grid }, "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: chart.grid } }}
      >
        {target !== undefined && (
          <ChartsReferenceLine y={target} label={`Target ${target}`} labelAlign="end" lineStyle={{ stroke: chart.ink, strokeDasharray: "4 4" }} labelStyle={{ fontSize: 12, fill: chart.ink }} />
        )}
        <ChartNotes months={rows.map((r) => r.month)} labels={labels} annotations={annotations} />
      </BarChart>
    </Box>
  );
}
