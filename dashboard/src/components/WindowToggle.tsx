"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import { useFilters } from "@/components/shell/useFilters";
import { WINDOWS, type WindowMonths } from "@/lib/filters";

/** 1, 3 or 12 months ending at the period month. Lives in the URL, so every breakdown page shares it. */
export function WindowToggle() {
  const { filters, setFilters } = useFilters();
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={filters.window}
      onChange={(_, v: WindowMonths | null) => v && setFilters({ window: v })}
      aria-label="Period length"
      data-print="hide"
    >
      {WINDOWS.map((w) => (
        <ToggleButton
          key={w}
          value={w}
          sx={{ px: 1.5, py: 0.5, whiteSpace: "nowrap" }}
        >
          {w === 1 ? "1 month" : `${w} months`}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
