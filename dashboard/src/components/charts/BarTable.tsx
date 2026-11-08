"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { Fragment, useState } from "react";

import { chart } from "@/components/charts/palette";
import { Icon } from "@/components/shell/icons";

export interface BarTableRow {
  key: string;
  label: string;
  /** A quieter second line under the label, for a date or a count that is not a column. */
  sublabel?: string;
  /** Bar length, relative to the largest row. */
  total: number;
  /** Darker part of the bar, in the same unit as `total`. Omit it for a solid bar. */
  fill?: number;
  /** Printed cells, right-aligned, one per `columns` entry. */
  cells: string[];
  /** A short series drawn as a sparkline when the table has a `trendHeader`. */
  trend?: number[];
  /** Rows inside this one, hidden until the row is expanded; their bars share the parent scale. */
  children?: BarTableRow[];
  muted?: boolean;
  /** A control for this row, e.g. an edit button, shown in a trailing column. */
  action?: React.ReactNode;
}

export interface BarTableProps {
  ariaLabel: string;
  /** Header for the label column. */
  labelHeader: string;
  /** Header over the bar column. */
  barHeader: string;
  /** Width of the bar column; narrow it when the numbers need the room. */
  barWidth?: string;
  /** Value that fills the whole column. Defaults to the largest row; pass 1 for rates so each bar shows its share of the whole. */
  max?: number;
  /** Headers for the numeric columns, in `cells` order. */
  columns: string[];
  rows: BarTableRow[];
  /** Header for a sparkline column drawn from each row's `trend`, placed after the numbers. */
  trendHeader?: string;
  /** What the child rows are called in the expand button's label, e.g. "platforms". */
  childNoun?: string;
  /** Tighter cell padding and a shorter bar, for a table in a half-width card. */
  dense?: boolean;
  /** Roomier rows, for a short table whose rows carry a second line and an action. */
  comfortable?: boolean;
  emptyText?: string;
}

/**
 * One compact row per item: the bar in its own column so lengths compare down
 * the page, the numbers in aligned columns beside it. The bar is decorative;
 * every value is printed. Rows with children expand in place.
 */
export function BarTable({ ariaLabel, labelHeader, barHeader, barWidth = "40%", max: fixedMax, columns, rows, trendHeader, childNoun = "rows", dense = false, comfortable = false, emptyText = "Nothing in this period." }: BarTableProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        {emptyText}
      </Typography>
    );
  }
  const max = fixedMax ?? Math.max(...rows.map((r) => r.total), 1);
  const hasActions = rows.some((r) => r.action !== undefined);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderRow = (r: BarTableRow, depth: number) => {
    const open = expanded.has(r.key);
    const expandable = (r.children?.length ?? 0) > 0;
    const quiet = r.muted || depth > 0;
    return (
      <Fragment key={r.key}>
        <TableRow sx={quiet ? { color: "text.secondary", "& td, & th": { color: "inherit" } } : undefined}>
          <TableCell component="th" scope="row" sx={{ fontWeight: depth ? 400 : 500, whiteSpace: "nowrap", pl: depth ? 2 + depth * 3.5 : undefined }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: expandable ? -0.75 : 0 }}>
              {expandable && (
                <IconButton size="small" onClick={() => toggle(r.key)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${r.label} ${childNoun}`} sx={{ p: 0.25, color: "text.secondary" }}>
                  <Box component="span" sx={{ display: "inline-flex", transition: "transform 150ms", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
                    <Icon name="chevronDown" size={14} />
                  </Box>
                </IconButton>
              )}
              <span>
                {r.label}
                {r.sublabel && (
                  <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block", fontWeight: 400, mt: 0.25, whiteSpace: "normal", maxWidth: 320 }}>
                    {r.sublabel}
                  </Typography>
                )}
              </span>
            </Box>
          </TableCell>
          <TableCell>
            <Box aria-hidden="true" sx={{ height: depth ? 6 : 8, borderRadius: 4, bgcolor: chart.grid, overflow: "hidden" }}>
              <Box data-testid="bar-total" sx={{ height: "100%", borderRadius: 4, bgcolor: chart.track, overflow: "hidden" }} style={{ width: `${(r.total / max) * 100}%` }}>
                <Box data-testid="bar-fill" sx={{ height: "100%", borderRadius: 4, bgcolor: chart.accent }} style={{ width: r.fill === undefined ? "100%" : r.total > 0 ? `${(r.fill / r.total) * 100}%` : "0%" }} />
              </Box>
            </Box>
          </TableCell>
          {r.cells.map((c, i) => (
            <TableCell key={columns[i] ?? i} align="right" sx={{ whiteSpace: "nowrap" }}>
              {c}
            </TableCell>
          ))}
          {trendHeader && (
            <TableCell align="right" sx={{ py: 0.5 }}>
              {r.trend && r.trend.length > 1 && (
                <Box data-testid="bar-trend" aria-hidden="true" sx={{ width: 96, height: 28, ml: "auto" }}>
                  <SparkLineChart data={r.trend} height={28} width={96} color={chart.spark} curve="linear" margin={{ top: 3, bottom: 2, left: 0, right: 0 }} />
                </Box>
              )}
            </TableCell>
          )}
          {hasActions && (
            <TableCell align="right" sx={{ py: 0, width: 56 }} data-print="hide">
              {r.action}
            </TableCell>
          )}
        </TableRow>
        {open && r.children?.map((c) => renderRow(c, depth + 1))}
      </Fragment>
    );
  };

  return (
    <TableContainer>
      <Table size="small" aria-label={ariaLabel} data-spacing={comfortable ? "comfortable" : undefined} sx={{ "& td, & th": { py: comfortable ? 2 : 1.25, px: dense ? 1 : 2 } }}>
        <TableHead>
          <TableRow>
            <TableCell>{labelHeader}</TableCell>
            <TableCell sx={{ width: barWidth, minWidth: dense ? 96 : 140 }}>{barHeader}</TableCell>
            {columns.map((c) => (
              <TableCell key={c} align="right" sx={{ whiteSpace: "nowrap" }}>
                {c}
              </TableCell>
            ))}
            {trendHeader && (
              <TableCell align="right" sx={{ whiteSpace: "nowrap", width: 112 }}>
                {trendHeader}
              </TableCell>
            )}
            {hasActions && <TableCell sx={{ width: 56 }} data-print="hide" />}
          </TableRow>
        </TableHead>
        <TableBody>{rows.map((r) => renderRow(r, 0))}</TableBody>
      </Table>
    </TableContainer>
  );
}
