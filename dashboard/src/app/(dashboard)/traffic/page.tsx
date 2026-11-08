import type { Metadata } from "next";

import { TrafficPage } from "@/components/pages/TrafficPage";

export const metadata: Metadata = { title: "Traffic" };

export default function Page() {
  return <TrafficPage />;
}
