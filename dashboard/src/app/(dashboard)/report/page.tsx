import type { Metadata } from "next";

import { ReportPage } from "@/components/pages/ReportPage";

export const metadata: Metadata = { title: "Monthly report" };

export default function Page() {
  return <ReportPage />;
}
