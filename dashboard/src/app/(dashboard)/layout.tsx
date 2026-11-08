import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { connection } from "next/server";
import { Suspense } from "react";

import { DashboardProvider } from "@/components/DashboardProvider";
import { AppShell } from "@/components/shell/AppShell";
import { kpiConfig } from "@/config/kpi";
import { getDataSource } from "@/data";

function ShellFallback() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}>
      <CircularProgress size={28} aria-label="Loading" />
    </Box>
  );
}

/**
 * Loads the records once for every page under the shell. The load is
 * request-time data (the backend feed is never cached), so with cache
 * components on it has to happen inside the Suspense boundary: the
 * fallback is prerendered, the rest streams in per request. The shell
 * also reads the URL (useSearchParams) and needs the same boundary.
 *
 * `connection()` makes that explicit whatever the source: without it, a
 * build made while the demo source was selected (no feed env) has nothing
 * request-time to wait for, prerenders every page as static demo HTML and
 * keeps serving it after the feed is configured.
 */
async function DashboardRoot({ children }: { children: React.ReactNode }) {
  await connection();
  const data = await getDataSource().getDashboardData();
  return (
    <DashboardProvider data={data} config={kpiConfig}>
      <AppShell>{children}</AppShell>
    </DashboardProvider>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <DashboardRoot>{children}</DashboardRoot>
    </Suspense>
  );
}
