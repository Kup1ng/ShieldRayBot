import type { Metadata } from "next";

import { SecurityPage } from "@/panel/pages/home/SecurityPage";

export const metadata: Metadata = { title: "امنیت · ShieldRay" };

export default function Page() {
  return <SecurityPage />;
}
