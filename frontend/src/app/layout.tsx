import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { LocaleProvider } from "@/components/shell/LocaleProvider";
import { CANVAS_HEX, THEME_BOOT_SCRIPT } from "@/lib/theme";

import "./globals.css";

const yekan = localFont({
  src: "../fonts/YekanBakh-VF.woff2",
  weight: "100 950",
  style: "normal",
  display: "swap",
  variable: "--font-yekan",
  preload: true,
});

export const metadata: Metadata = {
  title: "ShieldRay",
  description: "پنل و مینی‌اپ ShieldRay",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: CANVAS_HEX.light,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      data-theme="mouve-light"
      className={`${yekan.variable} light`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
