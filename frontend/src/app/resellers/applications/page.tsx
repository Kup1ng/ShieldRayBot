import type { Metadata } from "next";

import { ApplicationsPage } from "@/panel/pages/resellers/ApplicationsPage";

export const metadata: Metadata = { title: "درخواست‌های نمایندگی · ShieldRay" };

export default function Page() {
  return <ApplicationsPage />;
}
