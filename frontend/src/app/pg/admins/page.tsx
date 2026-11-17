import type { Metadata } from "next";

import { AdminsPage } from "@/panel/pages/pg_infra/AdminsPage";

export const metadata: Metadata = { title: "ادمین‌های پاسارگارد · ShieldRay" };

export default function Page() {
  return <AdminsPage />;
}
