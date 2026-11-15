import type { Metadata } from "next";

import { StaffActionsPage } from "@/panel/pages/home/StaffActionsPage";

export const metadata: Metadata = { title: "گزارش کارکنان · ShieldRay" };

export default function Page() {
  return <StaffActionsPage />;
}
