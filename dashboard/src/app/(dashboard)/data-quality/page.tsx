import type { Metadata } from "next";

import { DataQualityPage } from "@/components/pages/DataQualityPage";

export const metadata: Metadata = { title: "Data quality" };

export default function Page() {
  return <DataQualityPage />;
}
