import type { Metadata } from "next";

import { PlansPage } from "@/panel/pages/catalog/PlansPage";

export const metadata: Metadata = { title: "پلن‌ها · ShieldRay" };

export default function Page() {
  return <PlansPage />;
}
