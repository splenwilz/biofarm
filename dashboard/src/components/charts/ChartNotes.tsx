"use client";

import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";

import { chart } from "@/components/charts/palette";
import type { Annotation } from "@/lib/types";

export interface ChartNotesProps {
  /** The months on the x-axis, in plot order. */
  months: string[];
  /** The axis labels for those months, in the same order; the lines are placed by label. */
  labels: string[];
  annotations: Annotation[];
}

/**
 * Notes pinned to months, drawn as thin dashed markers with their text. Rendered inside a
 * chart, so every monthly chart draws the same notes the same way from the one shared list.
 */
export function ChartNotes({ months, labels, annotations }: ChartNotesProps) {
  return (
    <>
      {annotations.map((a) => {
        const index = months.indexOf(a.month);
        if (index === -1) return null;
        // late months anchor the text to the left of the line so it stays on the plot
        const late = index > (months.length * 2) / 3;
        return (
          <ChartsReferenceLine
            key={a.id}
            x={labels[index]}
            label={a.text}
            labelAlign="start"
            lineStyle={{ stroke: chart.ink, strokeDasharray: "2 3", strokeWidth: 1 }}
            labelStyle={{ fontSize: 11, fill: chart.ink, textAnchor: late ? "end" : "start" }}
          />
        );
      })}
    </>
  );
}
