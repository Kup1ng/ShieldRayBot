"use client";

import { SectionTabs, type SectionLink } from "../../ui/SectionTabs";

export type MyAccountTab = "subscription" | "wallet" | "credit" | "charges";

const TABS: SectionLink[] = [
  { key: "subscription", href: "/my-subscription", label: "اشتراک" },
  { key: "wallet", href: "/my-subscription/wallet", label: "کیف پول" },
  { key: "credit", href: "/my-subscription/credit", label: "اعتبار و صورت‌حساب" },
  { key: "charges", href: "/my-subscription/charges", label: "هزینه‌ها" },
];

/** The four pages of «اشتراک من»: the package, then the owner's money. */
export function MyAccountTabs({ active }: { active: MyAccountTab }) {
  return <SectionTabs label="اشتراک من" items={TABS} active={active} />;
}
