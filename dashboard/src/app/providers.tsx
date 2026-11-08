"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import theme from "@/theme";

/**
 * Client boundary for the theme. The theme holds style callbacks, and a server
 * layout cannot pass functions to a client component, so the provider lives in
 * a client file as the MUI App Router guide describes.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
