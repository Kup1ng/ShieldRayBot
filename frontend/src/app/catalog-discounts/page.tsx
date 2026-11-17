import type { Metadata } from "next";

import { DiscountsPage } from "@/panel/pages/catalog/DiscountsPage";

export const metadata: Metadata = { title: "تخفیف‌ها · ShieldRay" };

export default function Page() {
  return <DiscountsPage />;
}
