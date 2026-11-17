import type { Metadata } from "next";

import { PgHostsPage } from "@/panel/pages/pg_users/PgHostsPage";

export const metadata: Metadata = { title: "هاست‌های پاسارگارد · ShieldRay" };

export default function Page() {
  return <PgHostsPage />;
}
