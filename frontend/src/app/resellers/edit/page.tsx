import type { Metadata } from "next";

import { ResellerEditPage } from "@/panel/pages/resellers/ResellerEditPage";

export const metadata: Metadata = { title: "ویرایش نماینده · ShieldRay" };

// Served by the backend for /resellers/{id}/edit; the page reads the id from the address.
export default function Page() {
  return <ResellerEditPage />;
}
