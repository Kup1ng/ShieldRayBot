import type { Metadata } from "next";

import { PaygReportPage } from "@/panel/pages/billing/PaygReportPage";

export const metadata: Metadata = { title: "نمایندگان PAYG · ShieldRay" };

export default function Page() {
  return <PaygReportPage />;
}
