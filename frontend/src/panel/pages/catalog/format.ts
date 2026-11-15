/** Volume, duration and naming helpers of the catalog pages. */

import { fa } from "../../core/format";

/** Volume in GB; a missing or zero limit is unlimited, as in the bot. */
export function formatGb(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || !(gb > 0)) return "نامحدود";
  return `${fa(Math.round(gb * 100) / 100)} گیگ`;
}

export function formatDays(days: number | null | undefined): string {
  return days ? `${fa(days)} روز` : "نامحدود";
}

/** A pack's amount: gigabytes for a volume pack, days for a duration pack. */
export function formatPackAmount(kind: string, amount: number): string {
  return kind === "duration" ? `${fa(Math.trunc(amount))} روز` : formatGb(amount);
}

/** The sample username a naming pattern produces (same placeholders as the bot). */
export function namingSample(
  naming: { prefix: string; suffix: string; pattern: string },
  defaults: { prefix: string; suffix: string; pattern: string },
  volumeGb: string,
  random = "a1b2c3d4",
): string {
  const prefix = naming.prefix.trim() || defaults.prefix || "clk";
  const suffix = naming.suffix.trim() || defaults.suffix || "";
  const pattern = naming.pattern.trim() || defaults.pattern || "{prefix}_{random}{suffix}";
  const raw = volumeGb.trim();
  const volume = raw && Number(raw) > 0 ? String(Number(raw)) : "unlimited";
  return pattern
    .replaceAll("{prefix}", prefix)
    .replaceAll("{suffix}", suffix)
    .replaceAll("{random}", random)
    .replaceAll("{id}", "42")
    .replaceAll("{plan_volume}", volume)
    .replaceAll("{plan_unit}", "GB")
    .replaceAll("{username}", "ali_user");
}

/** `[{min, percent}]` as the handler's JSON, dropping unusable rows and sorting by quantity. */
export function serializeTiers(tiers: Array<{ min: string; percent: string }>): string {
  const rows = tiers
    .map((t) => ({ min: parseInt(t.min || "0", 10), percent: parseInt(t.percent || "0", 10) }))
    .filter((t) => t.min > 0 && t.percent >= 0 && t.percent <= 100)
    .sort((a, b) => a.min - b.min);
  return JSON.stringify(rows);
}
