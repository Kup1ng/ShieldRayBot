import type { Metadata } from "next";

import { TrialUsersPage } from "@/panel/pages/users/TrialUsersPage";

export const metadata: Metadata = { title: "کاربران تست · ShieldRay" };

export default function Page() {
  return <TrialUsersPage />;
}
