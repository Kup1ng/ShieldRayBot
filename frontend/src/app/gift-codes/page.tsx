import type { Metadata } from "next";

import { GiftCodesPage } from "@/panel/pages/catalog/GiftCodesPage";

export const metadata: Metadata = { title: "کد هدیه · ShieldRay" };

export default function Page() {
  return <GiftCodesPage />;
}
