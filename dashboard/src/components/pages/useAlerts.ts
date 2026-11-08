"use client";

import { useEffect, useMemo, useState } from "react";

import { useDashboard } from "@/components/DashboardProvider";
import { useReport } from "@/components/pages/useReport";
import { buildAlerts, dataQuality } from "@/lib/insights";
import { inboundEnquiries } from "@/lib/kpi";

/** Wall-clock "now" that starts as the sync time on the server and becomes the real clock after hydration. */
export function useNow(initial: string): string {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the server cannot know the client's clock
    setNow(new Date().toISOString());
  }, []);
  return now;
}

/** The alerts and data-quality counts for the current filters. */
export function useAlerts() {
  const { data, spend, config } = useDashboard();
  const { report } = useReport();
  const now = useNow(data.syncedAt);
  // quality counts cover marketing's enquiries: the team's outbound records are not expected to carry a person or a reply
  const quality = useMemo(() => dataQuality({ ...data, enquiries: inboundEnquiries(data.enquiries, config) }, spend, report.months), [data, config, spend, report.months]);
  const alerts = useMemo(() => buildAlerts({ report, quality, config, now }), [report, quality, config, now]);
  return { alerts, quality, now };
}
