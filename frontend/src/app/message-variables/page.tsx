import type { Metadata } from "next";

import { MessageVariablesPage } from "@/panel/pages/catalog/MessageVariablesPage";

export const metadata: Metadata = { title: "متغیرهای پیام · ShieldRay" };

export default function Page() {
  return <MessageVariablesPage />;
}
