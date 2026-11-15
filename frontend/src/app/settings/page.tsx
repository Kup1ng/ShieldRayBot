import type { Metadata } from "next";

import { SettingsPage } from "@/panel/pages/settings/SettingsPage";

export const metadata: Metadata = { title: "تنظیمات · ShieldRay" };

export default function SettingsRoute() {
  return <SettingsPage />;
}
