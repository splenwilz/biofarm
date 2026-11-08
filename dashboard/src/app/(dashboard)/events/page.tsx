import type { Metadata } from "next";

import { EventsPage } from "@/components/pages/EventsPage";

export const metadata: Metadata = { title: "Events" };

export default function Page() {
  return <EventsPage />;
}
