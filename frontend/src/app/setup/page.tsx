import type { Metadata } from "next";

import { SetupWizard } from "@/panel/pages/ops/setup/SetupWizard";

export const metadata: Metadata = { title: "راه‌اندازی اولیه · ShieldRay" };

export default function SetupRoute() {
  return <SetupWizard />;
}
