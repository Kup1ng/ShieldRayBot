import type { Metadata } from "next";

import { ChildPricingPage } from "@/panel/pages/resellers/ChildPricingPage";

export const metadata: Metadata = { title: "قیمت و اعتبار زیرمجموعه · ShieldRay" };

export default function Page() {
  return <ChildPricingPage />;
}
