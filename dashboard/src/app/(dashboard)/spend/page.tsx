import type { Metadata } from "next";

import { SpendPage } from "@/components/pages/SpendPage";

export const metadata: Metadata = { title: "Media spend" };

export default function Page() {
  return <SpendPage />;
}
