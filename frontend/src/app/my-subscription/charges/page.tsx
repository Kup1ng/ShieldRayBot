import type { Metadata } from "next";

import { MyChargesPage } from "@/panel/pages/resellers/MyChargesPage";

export const metadata: Metadata = { title: "هزینه‌ها · اشتراک من · ShieldRay" };

export default function Page() {
  return <MyChargesPage />;
}
