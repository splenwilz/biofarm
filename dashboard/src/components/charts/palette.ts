/**
 * Chart colours. One hue (the brand green) does the work: the accent for the
 * series that matters, a lighter step of the same ramp for tracks and context,
 * and a light-to-dark ramp for magnitude. Grey is the de-emphasis colour for
 * context series. Status (good/bad) colours live in the MUI palette. The same
 * values are registered on the theme as `palette.chart` so sx styles can use
 * them by key.
 */
export interface ChartPalette {
  accent: string;
  /** Lighter step of the same ramp: meter tracks, sparkline strokes. */
  track: string;
  spark: string;
  /** De-emphasis grey for context series (network deals). */
  context: string;
  grid: string;
  /** Axis and reference-line ink. */
  ink: string;
}

export const chart: ChartPalette = {
  accent: "#71977A",
  track: "#DCE6DE",
  spark: "#A9C3AF",
  context: "#E3E4E0",
  grid: "#EFF0EC",
  ink: "#6B6E6A",
};

/** Sequential ramp, lightest to darkest, for magnitude cells. */
export const RAMP = ["#EEF3EF", "#D9E4DB", "#BBD0BF", "#9BBAA2", "#71977A"] as const;
