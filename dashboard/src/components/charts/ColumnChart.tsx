"use client";

import Box from "@mui/material/Box";
import { BarChart } from "@mui/x-charts/BarChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";

import { ChartNotes } from "@/components/charts/ChartNotes";
import { chart } from "@/components/charts/palette";
import { monthLabel } from "@/lib/format";
import type { Annotation } from "@/lib/types";

export interface ColumnChartProps {
  months: string[];
  values: (number | null)[];
  /** Names the series; also the figure's accessible name. */
  label: string;
  format?: (value: number) => string;
  height?: number;
  referenceLine?: { value: number; label: string };
  /** Room for the y-axis labels; widen for currency. */
  yAxisWidth?: number;
  /** Notes pinned to months, drawn the same way as on the overview trend chart. */
  annotations?: Annotation[];
}

/** One series of monthly columns in the accent hue, thin and rounded, with the built-in hover tooltip. */
export function ColumnChart({ months, values, label, format, height = 220, referenceLine, yAxisWidth = 44, annotations = [] }: ColumnChartProps) {
  // keep a target line on the plot even when every bar is below it
  const top = Math.max(...values.map((v) => v ?? 0), referenceLine?.value ?? 0);
  const yMax = referenceLine && referenceLine.value >= top ? Math.ceil(referenceLine.value * 1.12) : undefined;
  const labels = months.map((m) => monthLabel(m, false));
  const hasNotes = annotations.some((a) => months.includes(a.month));
  return (
    <Box component="figure" aria-label={label} sx={{ m: 0 }}>
      <BarChart
        height={height}
        hideLegend
        borderRadius={4}
        xAxis={[{ scaleType: "band", data: labels, height: 26, categoryGapRatio: 0.55 }]}
        yAxis={[{ width: yAxisWidth, max: yMax, valueFormatter: (v: number) => (format ? format(v) : String(v)) }]}
        series={[{ data: values, label, color: chart.accent, valueFormatter: (v) => (v === null ? "–" : format ? format(v) : String(v)) }]}
        margin={{ left: 0, right: 8, top: hasNotes ? 18 : 12, bottom: 0 }}
        grid={{ horizontal: true }}
        sx={{ "& .MuiChartsGrid-line": { stroke: chart.grid }, "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: chart.grid } }}
      >
        {referenceLine && (
          <ChartsReferenceLine y={referenceLine.value} label={referenceLine.label} labelAlign="end" lineStyle={{ stroke: "#6B6E6A", strokeDasharray: "4 4" }} labelStyle={{ fontSize: 12, fill: "#6B6E6A" }} />
        )}
        <ChartNotes months={months} labels={labels} annotations={annotations} />
      </BarChart>
    </Box>
  );
}
