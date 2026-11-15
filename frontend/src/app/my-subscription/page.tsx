import type { Metadata } from "next";

import { MySubscriptionPage } from "@/panel/pages/resellers/MySubscriptionPage";

export const metadata: Metadata = { title: "اشتراک من · ShieldRay" };

export default function Page() {
  return <MySubscriptionPage />;
}
