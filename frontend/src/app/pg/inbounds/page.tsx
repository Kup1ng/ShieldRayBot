import type { Metadata } from "next";

import { InboundsPage } from "@/panel/pages/pg_infra/InboundsPage";

export const metadata: Metadata = { title: "اینباندهای پاسارگارد · ShieldRay" };

export default function Page() {
  return <InboundsPage />;
}
