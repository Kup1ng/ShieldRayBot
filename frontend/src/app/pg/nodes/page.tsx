import type { Metadata } from "next";

import { NodesPage } from "@/panel/pages/pg_infra/NodesPage";

export const metadata: Metadata = { title: "نودهای پاسارگارد · ShieldRay" };

export default function Page() {
  return <NodesPage />;
}
