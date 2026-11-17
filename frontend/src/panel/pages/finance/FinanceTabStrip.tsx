"use client";

import { Tabs } from "@heroui/react";

import type { FinanceOverview, FinanceTab } from "./types";

/** The Owner's PAYG report is its own page; its tab sits last and leads there. */
export const PAYG_TAB = "payg";
export const PAYG_REPORT_PATH = "/finance/payg";

export type StripTab = FinanceTab | typeof PAYG_TAB;

const TAB_LABELS: Record<StripTab, string> = {
  reports: "گزارشات",
  orders: "سفارشات",
  payments: "پرداخت‌ها",
  delivery: "تحویل ناموفق",
  cancellations: "درخواست‌های لغو",
  automation: "تمدید خودکار",
  payg: "نمایندگان PAYG",
};

/** The tabs this staff member may open, in the order the old strip showed them. */
export function stripTabs(overview: Pick<FinanceOverview, "tabs" | "can_payg_report">): StripTab[] {
  return overview.can_payg_report ? [...overview.tabs, PAYG_TAB] : overview.tabs;
}

/** Where a tab leads: the PAYG report page, or a tab of the finance page. */
export function tabHref(tab: StripTab): string {
  return tab === PAYG_TAB ? PAYG_REPORT_PATH : `/finance?tab=${tab}`;
}

/** The «مالی» tab strip shared by the finance page and the PAYG report. */
export function FinanceTabStrip({ tabs, selected, cancelAlert, onSelect }: { tabs: StripTab[]; selected: StripTab; cancelAlert: boolean; onSelect: (tab: StripTab) => void }) {
  return (
    <div className="mb-4 overflow-x-auto">
      <Tabs selectedKey={selected} onSelectionChange={(key) => onSelect(String(key) as StripTab)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="مدیریت مالی">
            {tabs.map((id) => (
              <Tabs.Tab key={id} id={id}>
                <span className="flex items-center gap-1.5">
                  {TAB_LABELS[id]}
                  {id === "cancellations" && cancelAlert ? <span role="img" aria-label="درخواست لغو در انتظار" className="inline-block size-2 rounded-full bg-danger" /> : null}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}
