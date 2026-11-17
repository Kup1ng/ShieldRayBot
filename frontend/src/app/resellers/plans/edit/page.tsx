import type { Metadata } from "next";

import { ResellerPlanEditPage } from "@/panel/pages/catalog/PlanEditPages";

export const metadata: Metadata = { title: "ویرایش پلن نمایندگی · ShieldRay" };

export default function Page() {
  return <ResellerPlanEditPage />;
}
