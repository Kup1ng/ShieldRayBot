import type { Metadata } from "next";

import { MiniApp } from "@/miniapp/MiniApp";

export const metadata: Metadata = {
  title: "مینی‌اپ",
};

export default function MiniAppPage() {
  return (
    <>
      {/* async: a blocked telegram.org must not hold the page; the launch address keeps the sign-in. */}
      <script src="https://telegram.org/js/telegram-web-app.js" async />
      <MiniApp />
    </>
  );
}
