import type { Metadata } from "next";

import { BroadcastPage } from "@/panel/pages/marketing/BroadcastPage";

export const metadata: Metadata = { title: "پیام گروهی · ShieldRay" };

export default function Page() {
  return <BroadcastPage />;
}
