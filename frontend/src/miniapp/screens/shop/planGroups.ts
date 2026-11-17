/**
 * The Figma picker (type → duration → volume) built from the flat /api/mini/plans list.
 * Plans carry no category, so "type" is the paid catalog versus the shop's free trial.
 */
import { num } from "../../core/format";
import type { Plan } from "./types";

export type PlanKind = "paid" | "trial";

const DAYS_PER_MONTH = 30;

/** "0" stands for unlimited time. */
export function durationKey(plan: Plan): string {
  const days = Number(plan.days) || 0;
  return String(days > 0 ? days : 0);
}

export function durationLabel(days: number | null | undefined): string {
  const d = Number(days) || 0;
  if (d <= 0) return "بدون محدودیت";
  if (d % DAYS_PER_MONTH === 0) return `${num(d / DAYS_PER_MONTH)} ماه`;
  return `${num(d)} روز`;
}

export function volumeLabel(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || !Number.isFinite(Number(gb))) return "نامحدود";
  return `${num(gb)} گیگ`;
}

/** Same text as the old plan rows: «۳۰ روز، ۲۰ گیگ». */
export function planMetaText(plan: Plan): string {
  const days = plan.days ? `${num(plan.days)} روز` : "نامحدود";
  const gb = plan.gb === null || plan.gb === undefined ? "حجم نامحدود" : `${num(plan.gb)} گیگ`;
  return `${days}، ${gb}`;
}

export function paidPlans(plans: Plan[]): Plan[] {
  return plans.filter((p) => !p.is_trial);
}

export function trialPlan(plans: Plan[]): Plan | null {
  return plans.find((p) => p.is_trial) ?? null;
}

/** The first paid plan, else the trial (the old screen's default). */
export function defaultPlanId(plans: Plan[]): number | null {
  const first = plans.find((p) => !p.is_trial) ?? plans[0];
  return first ? first.id : null;
}

export type DurationOption = { key: string; label: string };

/** Distinct durations of the paid plans, shortest first, unlimited last. */
export function durationOptions(plans: Plan[]): DurationOption[] {
  const keys = Array.from(new Set(paidPlans(plans).map(durationKey)));
  keys.sort((a, b) => (Number(a) || Number.MAX_SAFE_INTEGER) - (Number(b) || Number.MAX_SAFE_INTEGER));
  return keys.map((key) => ({ key, label: durationLabel(Number(key)) }));
}

export type VolumeOption = { plan: Plan; label: string };

/** Paid plans of one duration in catalog order; same-volume plans are told apart by name. */
export function volumeOptions(plans: Plan[], duration: string): VolumeOption[] {
  const list = paidPlans(plans).filter((p) => durationKey(p) === duration);
  const counts = new Map<string, number>();
  for (const p of list) counts.set(volumeLabel(p.gb), (counts.get(volumeLabel(p.gb)) ?? 0) + 1);
  return list.map((plan) => {
    const label = volumeLabel(plan.gb);
    return { plan, label: (counts.get(label) ?? 0) > 1 ? plan.name : label };
  });
}
