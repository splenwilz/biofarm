import type { Metadata } from "next";

import { CpdPage } from "@/components/pages/CpdPage";

export const metadata: Metadata = { title: "CPD bookings" };

export default function Page() {
  return <CpdPage />;
}
