import type { Metadata } from "next";

import { FunnelPage } from "@/panel/pages/marketing/FunnelPage";

export const metadata: Metadata = { title: "رفتار کاربر · ShieldRay" };

export default function Page() {
  return <FunnelPage />;
}
