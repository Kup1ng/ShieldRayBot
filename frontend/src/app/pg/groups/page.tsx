import type { Metadata } from "next";

import { PgGroupsPage } from "@/panel/pages/pg_users/PgGroupsPage";

export const metadata: Metadata = { title: "گروه‌های پاسارگارد · ShieldRay" };

export default function Page() {
  return <PgGroupsPage />;
}
