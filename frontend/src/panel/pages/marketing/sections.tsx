"use client";

import { useLocation } from "@/lib/location";

import { SectionTabs } from "../../ui/SectionTabs";
import type { MarketingSection } from "./types";

/** The strip's key for the page the staff member is on (loyalty has two entries, split by ?tab=). */
export function activeSection(path: string, search: string): string {
  if (path === "/loyalty") return new URLSearchParams(search).get("tab") === "transactions" ? "club_transactions" : "club";
  if (path === "/campaigns") return "campaigns";
  if (path === "/funnel") return "funnel";
  if (path === "/broadcast") return "broadcast";
  return "";
}

/** The marketing sections strip of the loyalty club, campaigns, funnel and broadcasts. */
export function MarketingStrip({ sections }: { sections: MarketingSection[] }) {
  const { path, search } = useLocation();
  return <SectionTabs label="بازاریابی و وفاداری" items={sections} active={activeSection(path, search)} />;
}
