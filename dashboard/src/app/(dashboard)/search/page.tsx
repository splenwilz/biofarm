import type { Metadata } from "next";

import { SearchPage } from "@/components/pages/SearchPage";

export const metadata: Metadata = { title: "Search & AI" };

export default function Page() {
  return <SearchPage />;
}
