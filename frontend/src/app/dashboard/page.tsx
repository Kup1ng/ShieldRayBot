import type { Metadata } from "next";

import { BotOverview } from "@/panel/pages/home/BotOverview";

export const metadata: Metadata = { title: "نمای کلی ربات · ShieldRay" };

export default function Page() {
  return <BotOverview />;
}
