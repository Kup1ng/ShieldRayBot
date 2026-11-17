import type { Metadata } from "next";

import { PaygChargesReviewPage } from "@/panel/pages/billing/PaygChargesReviewPage";

export const metadata: Metadata = { title: "بازبینی هزینه‌های PAYG · ShieldRay" };

export default function Page() {
  return <PaygChargesReviewPage />;
}
