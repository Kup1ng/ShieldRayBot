import type { Metadata } from "next";

import { LoyaltyPage } from "@/panel/pages/marketing/LoyaltyPage";

export const metadata: Metadata = { title: "باشگاه مشتریان · ShieldRay" };

export default function Page() {
  return <LoyaltyPage />;
}
