import type { Metadata } from "next";

import { RandomDiscountsPage } from "@/panel/pages/marketing/RandomDiscountsPage";

export const metadata: Metadata = { title: "تخفیف تصادفی · ShieldRay" };

export default function Page() {
  return <RandomDiscountsPage />;
}
