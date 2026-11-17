import type { Metadata } from "next";

import { FinancePage } from "@/panel/pages/finance/FinancePage";

export const metadata: Metadata = { title: "مدیریت مالی · ShieldRay" };

export default function FinanceRoute() {
  return <FinancePage />;
}
