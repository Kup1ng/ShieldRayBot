import type { Metadata } from "next";

import { UsersPage } from "@/panel/pages/users/UsersPage";

export const metadata: Metadata = { title: "کاربران بات · ShieldRay" };

export default function Page() {
  return <UsersPage />;
}
