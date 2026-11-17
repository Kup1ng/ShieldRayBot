import type { Metadata } from "next";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "ورود · ShieldRay" };

export default function LoginPage() {
  return <LoginForm />;
}
