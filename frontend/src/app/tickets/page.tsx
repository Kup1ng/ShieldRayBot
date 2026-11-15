import type { Metadata } from "next";

import { TicketsPage } from "@/panel/pages/ops/tickets/TicketsPage";

export const metadata: Metadata = { title: "پشتیبانی · ShieldRay" };

export default function TicketsRoute() {
  return <TicketsPage />;
}
