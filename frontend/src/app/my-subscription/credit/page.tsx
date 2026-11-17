import type { Metadata } from "next";

import { MyCreditPage } from "@/panel/pages/resellers/MyCreditPage";

export const metadata: Metadata = { title: "اعتبار و صورت‌حساب · اشتراک من · ShieldRay" };

export default function Page() {
  return <MyCreditPage />;
}
