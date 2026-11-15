import type { Metadata } from "next";

import { CampaignsPage } from "@/panel/pages/marketing/CampaignsPage";

export const metadata: Metadata = { title: "کمپین هدفمند · ShieldRay" };

export default function Page() {
  return <CampaignsPage />;
}
