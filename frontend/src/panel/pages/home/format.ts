/** Change lines, meter widths and chart day labels of the dashboard pages. */

import { fa } from "../../core/format";

export type Change = { direction: "up" | "down" | "flat"; text: string };

/**
 * The change line under a figure: ▲ / ▼ with the whole percent and what it is compared to, or the
 * «nothing to compare» text when the earlier period had no figure.
 */
export function describeChange(pct: number | null | undefined, suffix: string, noneText: string): Change {
  if (pct === null || pct === undefined) return { direction: "flat", text: noneText };
  if (pct > 0) return { direction: "up", text: `▲ ${fa(pct)}٪ ${suffix}` };
  if (pct < 0) return { direction: "down", text: `▼ ${fa(-pct)}٪ ${suffix}` };
  return { direction: "flat", text: `بدون تغییر ${suffix}` };
}

/** Whole percent clamped to a bar's width. */
export function clampPercent(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

/** Day label under a chart point: the weekday for a week, the short Persian date for a month. */
export function dayLabel(day: { date: string; weekday: string }, days: number): string {
  if (days <= 7) return day.weekday;
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "short" }).format(new Date(`${day.date}T12:00:00`));
  } catch {
    return day.date;
  }
}
