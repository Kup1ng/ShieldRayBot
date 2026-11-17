import type { Metadata } from "next";

import { UserEditPage } from "@/panel/pages/users/UserEditPage";

export const metadata: Metadata = { title: "ویرایش کاربر · ShieldRay" };

// Served by the backend for /users/{id}/edit; the page reads the id from the address.
export default function Page() {
  return <UserEditPage />;
}
