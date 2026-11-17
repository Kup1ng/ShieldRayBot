import type { Metadata } from "next";

import { PgOverviewPage } from "@/panel/pages/pg_infra/PgOverviewPage";

export const metadata: Metadata = { title: "نمای کلی پاسارگارد · ShieldRay" };

export default function Page() {
  return <PgOverviewPage />;
}
