import type { Metadata } from "next";

import { QualifiedPage } from "@/components/pages/QualifiedPage";

export const metadata: Metadata = { title: "Qualified opportunities" };

export default function Page() {
  return <QualifiedPage />;
}
