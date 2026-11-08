"use client";

import { createTheme } from "@mui/material/styles";

import { chart, type ChartPalette } from "@/components/charts/palette";

declare module "@mui/material/styles" {
  interface Palette {
    chart: ChartPalette;
  }
  interface PaletteOptions {
    chart?: ChartPalette;
  }
}

/**
 * Biofarm brand on MUI: a neutral near-white canvas, white surfaces, near-black
 * text, the sage green as an accent with black text on it (the brand rule:
 * green is never text on a light ground). CSS variables keep server and client
 * styles in step, as the MUI Next.js integration guide recommends.
 */
const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#71977A", contrastText: "#212121" },
    secondary: { main: "#212121" },
    background: { default: "#F7F7F5", paper: "#FFFFFF" },
    text: { primary: "#212121", secondary: "#6B6E6A" },
    divider: "#E6E7E3",
    warning: { main: "#b7791f" },
    success: { main: "#2f6b3f" },
    error: { main: "#9b2c1f" },
    action: { hover: "rgba(33, 33, 33, 0.05)" },
    chart,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "var(--font-inter), -apple-system, 'Segoe UI', Arial, sans-serif",
    h1: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.01em" },
    h2: { fontSize: "1rem", fontWeight: 600 },
    subtitle2: { fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
    body2: { fontSize: "0.875rem" },
    caption: { fontSize: "0.75rem" },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({ border: `1px solid ${theme.vars.palette.divider}`, backgroundImage: "none" }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: ({ theme }) => ({
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: theme.vars.palette.text.secondary,
          borderBottomColor: theme.vars.palette.divider,
        }),
        root: ({ theme }) => ({ fontVariantNumeric: "tabular-nums", borderBottomColor: theme.vars.palette.chart.grid }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: "none" } },
    },
  },
});

export default theme;
