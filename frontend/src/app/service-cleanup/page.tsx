import type { Metadata } from "next";

import { ServiceCleanupPage } from "@/panel/pages/cleanup/ServiceCleanupPage";

export const metadata: Metadata = { title: "پاکسازی سرویس‌ها · ShieldRay" };

export default function Page() {
  return <ServiceCleanupPage />;
}
