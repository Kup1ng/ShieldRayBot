import type { Metadata } from "next";

import { ConnectionStatusPage } from "@/panel/pages/ops/connection/ConnectionStatusPage";

export const metadata: Metadata = { title: "وضعیت اتصال · ShieldRay" };

export default function ConnectionStatusRoute() {
  return <ConnectionStatusPage />;
}
