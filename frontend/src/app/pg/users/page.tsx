import type { Metadata } from "next";

import { PgUsersPage } from "@/panel/pages/pg_users/PgUsersPage";

export const metadata: Metadata = { title: "کاربران پاسارگارد · ShieldRay" };

export default function Page() {
  return <PgUsersPage />;
}
