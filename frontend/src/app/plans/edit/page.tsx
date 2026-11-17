import type { Metadata } from "next";

import { PlanEditPage } from "@/panel/pages/catalog/PlanEditPages";

export const metadata: Metadata = { title: "ویرایش پلن · ShieldRay" };

export default function Page() {
  return <PlanEditPage />;
}
