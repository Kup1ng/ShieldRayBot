import type { Metadata } from "next";

import { ResellersPage } from "@/panel/pages/resellers/ResellersPage";

export const metadata: Metadata = { title: "نمایندگان · ShieldRay" };

export default function Page() {
  return <ResellersPage />;
}
