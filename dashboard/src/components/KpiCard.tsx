import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

import { chart } from "@/components/charts/palette";
import { InfoTip } from "@/components/InfoTip";

export interface KpiDelta {
  /** Change against the comparison period, in the value's own unit. */
  value: number;
  /** What it is compared with, e.g. "vs Sep 2026". */
  note: string;
  /** Which direction is good. Cost goes the other way from counts. */
  betterWhen?: "up" | "down";
  format?: (value: number) => string;
}

export interface KpiCardProps {
  label: string;
  value: string;
  detail?: string;
  delta?: KpiDelta;
  /** A plain comparison line in the change row, for values that are words rather than numbers. */
  compare?: string;
  progress?: { value: number; target: number; label?: string };
  /** Twelve-point series behind the value, drawn as a quiet sparkline. */
  trend?: number[];
  /** Where the number came from, when the card has room to say so; otherwise it belongs in `info`. */
  footnote?: string;
  testId?: string;
  /** For values that are words, not numbers: a smaller size that does not wrap. */
  textValue?: boolean;
  /** The longer explanation, kept behind an info icon; an array is shown as separate short lines. */
  info?: string | string[];
}

function deltaColor(delta: KpiDelta): string {
  if (delta.value === 0) return "text.secondary";
  const good = delta.betterWhen === "down" ? delta.value < 0 : delta.value > 0;
  return good ? "success.main" : "error.main";
}

/**
 * Headline stat tile. Every card has the same rows in the same order: label, value with
 * sparkline, change, detail, footnote. The change row keeps its space when empty and the
 * footnote sits at the bottom, so cards in a row line up whatever each one has to show.
 */
export function KpiCard({
  label,
  value,
  detail,
  delta,
  compare,
  progress,
  trend,
  footnote,
  testId,
  textValue = false,
  info,
}: KpiCardProps) {
  const percent = progress
    ? Math.min(100, Math.round((progress.value / progress.target) * 100))
    : null;
  const deltaText = delta
    ? `${delta.value > 0 ? "+" : delta.value < 0 ? "−" : "±"}${(delta.format ?? String)(Math.abs(delta.value))} ${delta.note}`
    : null;
  return (
    <Paper
      data-testid={testId}
      sx={{ p: 2.5, height: "100%", display: "flex", flexDirection: "column" }}
    >
      <Stack spacing={0.75} sx={{ flex: 1 }}>
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            minHeight: 28,
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            component="h2"
            sx={{ fontWeight: 500 }}
          >
            {label}
          </Typography>
          {info && <InfoTip about={label} text={info} />}
        </Stack>
        <Stack
          direction="row"
          sx={{
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 2,
            minHeight: 36,
          }}
        >
          <Typography
            component="p"
            sx={{
              fontSize: textValue ? "1.25rem" : "1.75rem",
              fontWeight: 600,
              lineHeight: 1.2,
              minWidth: 0,
            }}
          >
            {value}
          </Typography>
          {trend && trend.length > 1 && (
            <Box
              aria-hidden="true"
              sx={{ width: 96, height: 36, flexShrink: 0 }}
            >
              <SparkLineChart
                data={trend}
                height={36}
                width={96}
                color={chart.spark}
                curve="linear"
                margin={{ top: 4, bottom: 2, left: 0, right: 0 }}
              />
            </Box>
          )}
        </Stack>
        <Typography
          data-testid="kpi-delta"
          variant="caption"
          sx={{
            display: "block",
            minHeight: 20,
            color: delta ? deltaColor(delta) : "text.secondary",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {deltaText ?? compare}
        </Typography>
        {detail && (
          <Typography data-testid="kpi-detail" variant="body2" color="text.secondary">
            {detail}
          </Typography>
        )}
        {progress && percent !== null && (
          <Stack spacing={0.5} sx={{ pt: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={percent}
              aria-label={`${progress.value} of target ${progress.target}`}
              sx={{ height: 6, borderRadius: 3, bgcolor: "#EFF0EC" }}
            />
            <Typography variant="caption" color="text.secondary">
              {progress.label ??
                `${progress.value} of target ${progress.target} a month`}
            </Typography>
          </Stack>
        )}
        {footnote && (
          <Typography data-testid="kpi-footnote" variant="caption" color="text.secondary" sx={{ pt: 0.5, mt: "auto" }}>
            {footnote}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
