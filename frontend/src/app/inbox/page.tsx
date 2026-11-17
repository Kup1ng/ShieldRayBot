import type { Metadata } from "next";

import { InboxPage } from "@/panel/pages/home/InboxPage";

export const metadata: Metadata = { title: "اعلان‌ها · ShieldRay" };

export default function Page() {
  return <InboxPage />;
}
