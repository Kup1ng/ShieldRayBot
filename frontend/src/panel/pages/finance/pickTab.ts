import type { FinanceTab } from "./types";

/** The tab to show: the asked one if the staff member may open it, else the first they may. */
export function pickTab(asked: string, allowed: FinanceTab[]): FinanceTab {
  return (allowed as string[]).includes(asked) ? (asked as FinanceTab) : allowed[0];
}
