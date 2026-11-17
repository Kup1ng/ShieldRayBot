import type { Metadata } from "next";

import { HomeDashboard } from "@/panel/pages/home/HomeDashboard";

export const metadata: Metadata = { title: "داشبورد · ShieldRay" };

export default function HomePage() {
  return <HomeDashboard />;
}
