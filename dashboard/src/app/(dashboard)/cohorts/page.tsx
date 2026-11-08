import type { Metadata } from "next";

import { CohortsPage } from "@/components/pages/CohortsPage";

export const metadata: Metadata = { title: "Enquiry to qualified" };

export default function Page() {
  return <CohortsPage />;
}
