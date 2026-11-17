import type { Metadata } from "next";

import { PgTemplatesPage } from "@/panel/pages/pg_users/PgTemplatesPage";

export const metadata: Metadata = { title: "تمپلیت‌های پاسارگارد · ShieldRay" };

export default function Page() {
  return <PgTemplatesPage />;
}
