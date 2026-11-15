/** Wording and small conversions shared by the PasarGuard infrastructure pages. */

import type { ChipColor } from "../../core/format";
import { toman } from "../../core/format";
import type { PlanOption, StatusKind } from "./types";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Latin digits from the server's text («1.5 گیگ») shown as Persian digits with the Persian decimal mark. */
export function faDigits(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/(\d)\.(?=\d)/g, "$1٫").replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

/** A number and its unit as the server split them; a missing number shows a dash. */
export function partsText(parts: { num: string; unit: string } | null | undefined): string {
  if (!parts || !parts.num || parts.num === "—") return "—";
  return faDigits(parts.unit ? `${parts.num} ${parts.unit}` : parts.num);
}

const STATUS_COLOR: Record<StatusKind, ChipColor> = { ok: "success", warn: "warning", err: "danger", neutral: "default" };

export function statusColor(kind: StatusKind | string): ChipColor {
  return STATUS_COLOR[kind as StatusKind] ?? "default";
}

export function planKindTag(plan: PlanOption): string {
  if (plan.plan_kind === "current_capacity") return "[ظرفیت فعلی] ";
  return plan.billing_mode === "payg" ? "[PAYG] " : "[ثابت] ";
}

/**
 * The text of one plan option. `tagged` adds the kind tag (grant forms); the price per GB of a
 * pay-as-you-go plan replaces its duration.
 */
export function planLabel(plan: PlanOption, { tagged, withDuration }: { tagged: boolean; withDuration: boolean }): string {
  const payg = plan.billing_mode === "payg" && plan.price_per_gb > 0;
  let label = `${tagged ? planKindTag(plan) : ""}${plan.name}`;
  if (payg) label += ` · ${toman(plan.price_per_gb)} / گیگ`;
  else if (withDuration && plan.duration_days > 0) label += ` — ${plan.duration_days.toLocaleString("fa-IR")} روز`;
  return label;
}
