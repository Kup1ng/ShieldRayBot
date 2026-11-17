import type { Metadata } from "next";

import { ShopBroadcastPage } from "@/panel/pages/marketing/ShopBroadcastPage";

export const metadata: Metadata = { title: "پیام گروهی · ShieldRay" };

export default function Page() {
  return <ShopBroadcastPage />;
}
