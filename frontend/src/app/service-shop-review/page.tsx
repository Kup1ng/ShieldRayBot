import type { Metadata } from "next";

import { ShopReviewPage } from "@/panel/pages/resellers/ShopReviewPage";

export const metadata: Metadata = { title: "تعیین فروشگاه سرویس · ShieldRay" };

export default function Page() {
  return <ShopReviewPage />;
}
