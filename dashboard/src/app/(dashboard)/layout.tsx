import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireSession } from "@/auth/session";
import { DashboardProvider } from "@/components/DashboardProvider";
import { FeedUnavailable } from "@/components/FeedUnavailable";
import { AppShell } from "@/components/shell/AppShell";
import { kpiConfig } from "@/config/kpi";
import { getDataSource } from "@/data";
import type { DashboardData } from "@/lib/types";

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
 *
 * A feed that does not deliver (no import yet, schema behind the code, wrong
 * token, no answer) is shown with the API's own explanation rather than
 * thrown: in production Next hands the error boundary a generic message and
 * a digest, which would leave the reader guessing. The demo source never fails.
 *
 * The session is checked here as well as in proxy.ts (the authentication
 * guide's rule: the check nearest the data is the one that counts); the role
 * it carries decides which controls the pages show.
 */
async function DashboardRoot({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await requireSession();
  let data: DashboardData;
  try {
    data = await getDataSource().getDashboardData();
  } catch (err) {
    unstable_rethrow(err); // a Next-internal signal (the docs list no-store fetches) must reach Next, not this panel
    console.error("dashboard feed unavailable:", err);
    return <FeedUnavailable message={err instanceof Error ? err.message : String(err)} />;
  }
  return (
    <DashboardProvider data={data} config={kpiConfig} role={session.role}>
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
