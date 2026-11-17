import type { Metadata } from "next";

import { ShopSettingsPage } from "@/panel/pages/ops/ShopSettingsPage";

export const metadata: Metadata = { title: "تنظیمات فروشگاه · ShieldRay" };

export default function ShopSettingsRoute() {
  return <ShopSettingsPage />;
}
