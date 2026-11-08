import type { Metadata } from "next";

import { NewsletterPage } from "@/components/pages/NewsletterPage";

export const metadata: Metadata = { title: "Newsletter" };

export default function Page() {
  return <NewsletterPage />;
}
