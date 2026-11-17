import type { Metadata } from "next";

import { MyWalletPage } from "@/panel/pages/resellers/MyWalletPage";

export const metadata: Metadata = { title: "کیف پول · اشتراک من · ShieldRay" };

export default function Page() {
  return <MyWalletPage />;
}
