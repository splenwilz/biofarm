import type { Metadata } from "next";

import { KpiRulePage } from "@/components/pages/KpiRulePage";

export const metadata: Metadata = { title: "KPI rule" };

export default function Page() {
  return <KpiRulePage />;
}
